// 差分变异的逻辑：收集位点、覆盖门控与历史沿用、逐位点裁定、汇总与格式化。模型见 ../../metrics-model.md。
// 不读 argv，不 exit。进程生命周期（信号、退出码）归命令面；写入器与测试运行器在这里，命令面拿着它们做还原与中断。
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { cpus, freemem, loadavg, tmpdir } from "node:os";
import { changedLines, inScope, lookupFile, nestedUnits, ownLines, unitDigests, score, baseLabel, TEST_FILE_RE, testFilesDigest } from "./core.mjs";
import { TOOL_VERSION } from "./version.mjs";

// ---- 资源：容量自测、份额、并行度。模型见 ../../metrics-model.md「资源」。

/** 机器容量：逻辑 CPU 数、可用内存（MB）、1 分钟负载。 */
export const capacity = () => ({ cpus: Math.max(1, cpus().length), freeMemMb: Math.round(freemem() / 1048576), load1: Math.round(loadavg()[0] * 100) / 100 });

/**
 * 并行度：份额 = 1 / (同机另有的重型任务数 + 1)；上限 = max(1, floor(cpus × 份额))；
 * 可用内存低于阈值时上限减半；显式给的 workers 不能超过上限。
 */
export function plannedWorkers(cap, { otherHeavyTasks = 0, lowMemoryHalveMb = 2048, workers = null } = {}) {
  const share = 1 / (otherHeavyTasks + 1);
  let ceiling = Math.max(1, Math.floor(cap.cpus * share));
  const halved = cap.freeMemMb < lowMemoryHalveMb;
  if (halved) ceiling = Math.max(1, Math.floor(ceiling / 2));
  const capped = workers !== null && workers > ceiling;
  const effective = workers === null ? ceiling : Math.max(1, Math.min(workers, ceiling));
  return { share, ceiling, workers: effective, requested: workers, capped, halved };
}

/** 交给测试命令的环境：并行度写进 PQW_TEST_WORKERS 与 VITEST_MAX_WORKERS；剥掉 NODE_TEST_CONTEXT，免得嵌套的 node --test 退出码失真。 */
export function runnerEnv(base, workers) {
  const env = { ...base, PQW_TEST_WORKERS: String(workers), VITEST_MAX_WORKERS: String(workers) };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

/** 负载比：1 分钟负载 ÷ 逻辑 CPU 数。 */
export const loadRatio = () => loadavg()[0] / Math.max(1, cpus().length);

/**
 * 运行中自适应：每个位点前采一次负载比，超过上限就把并行度减半（至少 1），回落到上限减去滞回量以下再翻倍（不超过计划值）；
 * 中间地带不动，免得抖动。并行度已是 1 还连续 3 次超限，记「繁忙」，继续跑但耗时不再代表工具本身。
 */
export function createAdapter({ planned, ceiling = 0.8, hysteresis = 0.2, sampler = loadRatio }) {
  const state = { workers: planned, samples: 0, downshifts: 0, upshifts: 0, minWorkers: planned, busy: false };
  const floor = round2(ceiling - hysteresis);
  let hot = 0;
  return {
    state,
    next() {
      const ratio = sampler();
      state.samples++;
      if (ratio > ceiling) {
        hot++;
        if (state.workers > 1) { state.workers = Math.floor(state.workers / 2); state.downshifts++; } else if (hot >= 3) state.busy = true;
      } else {
        hot = 0;
        if (ratio < floor && state.workers < planned) { state.workers = Math.min(planned, state.workers * 2); state.upshifts++; }
      }
      state.minWorkers = Math.min(state.minWorkers, state.workers);
      return state.workers;
    },
  };
}
import { analyze, sites as findSites, SOURCE_RE, DECLARATION_RE } from "./adapter-typescript.mjs";

export { TEST_FILE_RE };
const NODE_MODULES_RE = /(^|\/)node_modules\//;
const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 };

/** 时长字符串转毫秒：`90s`、`20m`、`1.5h`，无单位按秒。没给返回 fallback；格式错返回 null。 */
export function parseDuration(text, fallback) {
  if (!text) return fallback;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(text);
  return m ? Number(m[1]) * UNITS[m[2] ?? "s"] : null;
}

/** 能打位点的文件：在范围内、是源码、不是声明文件、不是测试、不在 node_modules、还在工作树里。 */
export const isMutable = (root, path, scope) => inScope(path, scope) && SOURCE_RE.test(path) && !DECLARATION_RE.test(path) && !TEST_FILE_RE.test(path) && !NODE_MODULES_RE.test(path) && existsSync(join(root, path));

/** 单元自己的行里有改动时返回这些行的集合，否则 null。 */
export function changedOwnLines(unit, units, ranges) {
  const own = new Set(ownLines(unit, nestedUnits(unit, units)));
  return ranges.some(([a, b]) => [...own].some((l) => l >= a && l <= b)) ? own : null;
}

/** 空行或只有注释的行：改了也没有可执行的东西，不算未覆盖段。 */
const TRIVIAL_LINE_RE = /^\s*(\/\/.*|\/\*.*|\*.*|)$/;

/** 改动行里不落在任何有名单元内、又不是空行或注释的连续段（模块级的改动）。text 是文件内容，用来认注释。 */
export function moduleLevelSegments(ranges, units, text = "") {
  const named = units.filter((u) => u.name !== "<module>");
  const lines = text.split("\n");
  const inUnit = (l) => named.some((u) => l >= u.startLine && l <= u.endLine);
  const trivial = (l) => TRIVIAL_LINE_RE.test(lines[l - 1] ?? "");
  const segments = [];
  for (const [a, b] of ranges) {
    let start = null;
    for (let l = a; l <= b + 1; l++) {
      const outside = l <= b && !inUnit(l) && !trivial(l);
      if (outside && start === null) start = l;
      if (!outside && start !== null) { segments.push([start, l - 1]); start = null; }
    }
  }
  return segments;
}

/** 一个单元在改动行上的位点；单元没被改到（或是 <module>）返回 null。 */
function unitSites(ts, sourceFile, text, unit, units, ranges) {
  const own = unit.name === "<module>" ? null : changedOwnLines(unit, units, ranges);
  return own ? findSites(ts, sourceFile, text, unit, own) : null;
}

/**
 * 收集基线到工作树改动单元的全部位点。返回 { files: path → { text, units, digests }, sites, unmutated }。
 * unmutated 是改动了却没有位点的段：改动行不在任何有名单元里（模块级），或单元里没有可替换的位点；它们不进分数，要单独列出来。
 */
/** 一个文件的位点与未覆盖段：改动文件只看改动行，点名的文件（pinned）全部有名单元都打，也不列未覆盖段。 */
function fileSites(ts, path, text, ranges, isPinned) {
  const { sourceFile, units } = analyze(ts, path, text);
  const digests = unitDigests(text, units);
  const sites = [];
  const unmutated = [];
  if (!isPinned) for (const lines of moduleLevelSegments(ranges, units, text)) unmutated.push({ file: path, unit: null, lines, reason: "改动行不在任何有名单元里" });
  for (const unit of units) {
    const found = unitSites(ts, sourceFile, text, unit, units, ranges);
    if (found === null) continue;
    if (found.length === 0 && !isPinned) unmutated.push({ file: path, unit: unit.name, lines: [unit.startLine, unit.endLine], reason: "单元里没有可替换的位点" });
    for (const s of found) sites.push({ file: path, unit: unit.name, digest: digests.get(unit.name), ...s, offset: s.start - unit.startByte, pinned: isPinned, verdict: "planned", reason: null, runs: 0, seconds: null });
  }
  return { entry: { text, units, digests }, sites, unmutated };
}

/** 收集位点：基线到工作树的改动文件加点名的文件，去掉不可变异的。 */
export function collectSites({ root, base, ts, scope, pinned = [] }) {
  const files = new Map();
  const sites = [];
  const unmutated = [];
  const changed = changedLines(root, base);
  for (const path of new Set([...changed.keys(), ...pinned])) {
    if (!isMutable(root, path, scope)) continue;
    const text = readFileSync(join(root, path), "utf8");
    const isPinned = pinned.includes(path);
    const file = fileSites(ts, path, text, isPinned ? [[1, text.split("\n").length]] : changed.get(path), isPinned);
    files.set(path, file.entry);
    sites.push(...file.sites);
    unmutated.push(...file.unmutated);
  }
  sites.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
  // id 不含行号与文件内偏移：文件上方加几行不影响沿用；单元内偏移加类别与替换足以认出同一个位点。
  for (const s of sites) s.id = `${s.file}:${s.unit}:${s.offset}:${s.category}:${s.mutant}`;
  return { files, sites, unmutated };
}

/** 历史指纹：工具版本、测试命令、测试文件摘要。任一项变了，上次的杀死就不能再信。 */
export const fingerprintOf = (root, testCommand) => ({ toolVersion: TOOL_VERSION, testCommand, testFilesDigest: testFilesDigest(root) });

const FINGERPRINT_LABEL = { toolVersion: "工具版本", testCommand: "测试命令", testFilesDigest: "测试文件" };

/** 历史不能沿用的原因；能沿用（或调用方不核指纹）返回 null。 */
function historyMismatch(history, fingerprint) {
  if (!history || !fingerprint) return null;
  if (!history.fingerprint) return "历史没有指纹";
  for (const k of Object.keys(FINGERPRINT_LABEL)) if (history.fingerprint[k] !== fingerprint[k]) return `历史指纹不同（${FINGERPRINT_LABEL[k]}）`;
  return null;
}

/** 位点所在行或所在语句行有执行记录。没有 lcov 时一律算有覆盖。 */
export function isCovered(report, s) {
  if (!report) return true;
  const rec = lookupFile(report, s.file);
  if (!rec) return false;
  const hit = (l) => (rec.lines.get(l)?.[0] ?? 0) > 0 || (rec.branches.get(l)?.[0] ?? 0) > 0;
  return hit(s.line) || hit(s.anchorLine);
}

/**
 * 选择：无覆盖的标 uncovered；上次已杀死且单元摘要未变的沿用 killed。原地改。
 * 给了 fingerprint 就先核历史的指纹，不同就整份不沿用。返回 { given, used, reason, carried }。
 */
export function selectSites(sites, report, history, fingerprint = null) {
  const reason = historyMismatch(history, fingerprint);
  const prior = new Map(reason === null ? (history?.sites ?? []).map((s) => [s.id, s]) : []);
  let carried = 0;
  for (const s of sites) {
    if (!isCovered(report, s)) { s.verdict = "uncovered"; continue; }
    const p = prior.get(s.id);
    if (p && p.digest === s.digest && p.verdict === "killed") { s.verdict = "killed"; s.reason = "carried"; carried++; }
  }
  return { given: Boolean(history), used: Boolean(history) && reason === null, reason, carried };
}

/** 写入器：一次只写一个文件，记住原文；还原后逐字节核对，返回是否一致。没有待还原的也返回 true。 */
/** 还原日志的位置：系统临时目录下按仓库根哈希命名，同一仓库的两次运行共用一份。 */
export const restoreLogPath = (root) => join(tmpdir(), "pqw-mutation", createHash("sha256").update(root).digest("hex").slice(0, 16) + ".json");

/** 被改动：文件现在不是工具期望的内容。调用方据此退出 1，不覆盖。 */
const tampered = (path) => Object.assign(new Error(`文件在变异期间被改动：${path}`), { code: "tampered", path });

/** 启动时：上次运行留下日志（被 SIGKILL 或断电）就把原文写回去、删日志，返回还原的路径；没有日志或日志不是本仓库的返回 null。 */
export function restorePending(root) {
  const logPath = restoreLogPath(root);
  if (!existsSync(logPath)) return null;
  const log = JSON.parse(readFileSync(logPath, "utf8"));
  if (log.root !== root) return null;
  writeFileSync(join(root, log.path), log.original);
  unlinkSync(logPath);
  return log.path;
}

/**
 * 打补丁：写入前核文件仍等于原文，并先把 { root, path, original } 落到还原日志再写；还原时核文件仍等于写入的变异体，
 * 等就写回原文、逐字节核对、删日志；不等（测试期间被人改了）就不覆盖、保留日志并抛 tampered。
 */
export function createPatcher(root, logPath = restoreLogPath(root)) {
  let applied = null;
  const current = (path) => readFileSync(join(root, path), "utf8");
  return {
    apply(path, original, mutated) {
      if (current(path) !== original) throw tampered(path);
      mkdirSync(dirname(logPath), { recursive: true });
      writeFileSync(logPath, JSON.stringify({ root, path, original }));
      applied = { path, original, mutated };
      writeFileSync(join(root, path), mutated);
    },
    restore() {
      if (!applied) return true;
      const { path, original, mutated } = applied;
      applied = null;
      if (current(path) !== mutated) throw tampered(path);
      writeFileSync(join(root, path), original);
      const ok = current(path) === original;
      if (ok) unlinkSync(logPath);
      return ok;
    },
  };
}

/** 能不能降优先级：Windows 不设；其他平台探一次 `nice -n 0 true`，没有 nice 命令或设不了就不设，调用方据此写明。 */
export const niceAvailable = () => process.platform !== "win32" && spawnSync("nice", ["-n", "0", "true"], { stdio: "ignore" }).status === 0;

/** 测试运行器：shell 里跑命令，超时杀整个进程组；nice 给了就以低优先级启动；run 给了 workers 就临时换并行度。run 从不 reject。 */
export function createTestRunner(command, cwd, env, { nice = null } = {}) {
  let child = null;
  const launch = (runEnv) => (nice === null
    ? spawn(command, { cwd, shell: true, env: runEnv, stdio: ["ignore", "pipe", "pipe"], detached: true })
    : spawn("nice", ["-n", String(nice), "sh", "-c", command], { cwd, env: runEnv, stdio: ["ignore", "pipe", "pipe"], detached: true }));
  return {
    run: (timeoutMs, workers = null) => new Promise((done) => {
      const t0 = Date.now();
      let output = "";
      let timedOut = false;
      child = launch(workers === null ? env : runnerEnv(env, workers));
      child.stdout.on("data", (d) => { output += d; });
      child.stderr.on("data", (d) => { output += d; });
      const timer = setTimeout(() => { timedOut = true; killGroup(child); }, timeoutMs);
      child.on("close", (code, signal) => { clearTimeout(timer); child = null; done({ code, signal, timedOut, output, seconds: (Date.now() - t0) / 1000 }); });
    }),
    kill: () => { if (child) killGroup(child); },
  };
}

const killGroup = (child) => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };

/**
 * 一次测试运行的裁定：超时记 killed(timeout)；被信号结束或退出码 128 以上（shell 报告的信号）记 notRun(crashed)，
 * 不能当杀死；非零退出记 killed；输出命中「没跑测试」记 notRun(noTests)；否则 survived。
 */
export function verdictOf(r, noTests) {
  if (r.timedOut) return ["killed", "timeout"];
  if (r.signal || (r.code !== null && r.code >= 128)) return ["notRun", "crashed"];
  if (r.code !== 0) return ["killed", null];
  return noTests.test(r.output) ? ["notRun", "noTests"] : ["survived", null];
}

/** 裁定一个位点：写入、跑测试、还原；「没跑测试」复跑一次。返回还原是否成功。 */
export async function judgeSite(s, original, { runner, patcher, timeoutMs, noTests, workers = null }) {
  const mutated = original.slice(0, s.start) + s.mutant + original.slice(s.end);
  let seconds = 0;
  let restored = true;
  for (let round = 1; round <= 2; round++) {
    s.runs = round;
    patcher.apply(s.file, original, mutated);
    let r;
    try { r = await runner.run(timeoutMs, workers); } finally { if (!patcher.restore()) restored = false; }
    seconds += r.seconds;
    [s.verdict, s.reason] = verdictOf(r, noTests);
    if (s.reason !== "noTests") break;
  }
  s.seconds = Math.round(seconds * 100) / 100;
  return restored;
}

/** 永不命中：基线输出本身就命中「没跑测试」模式时，模式判不出任何东西，裁定时不再用它。 */
const NEVER = /(?!)/;
const effectivePattern = (noTests, baselineOutput) => (noTests.test(baselineOutput) ? NEVER : noTests);

/** 自身开销：总耗时里不在测试命令上的部分。now 可注入，便于核算式。 */
export function selfTiming(t0, testSeconds, now = Date.now()) {
  const totalSeconds = (now - t0) / 1000;
  const overhead = totalSeconds > 0 ? Math.max(0, (totalSeconds - testSeconds) / totalSeconds) : 0;
  return { totalSeconds: round2(totalSeconds), testSeconds: round2(testSeconds), overheadRatio: round2(overhead) };
}
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * 执行：先跑基线，再按预算逐个裁定 planned 的位点。timeoutMs 为 null 时基线 10 分钟、位点取基线用时的 5 倍（至少 10 秒）。
 * adapter 给了就每个位点前取一次并行度交给运行器。返回里带计时与自适应状态。
 */
export async function runSites({ sites, files, runner, patcher, budgetMs, timeoutMs, noTests, adapter = NO_ADAPTER }) {
  const t0 = Date.now();
  const b = await runner.run(timeoutMs ?? 10 * 60000);
  const siteNoTests = effectivePattern(noTests, b.output);
  const baseline = { passed: b.code === 0 && !b.timedOut, seconds: b.seconds, tail: b.output.split("\n").slice(-5).join("\n"), patternHit: siteNoTests === NEVER };
  const budget = { limitMs: budgetMs, exceeded: false };
  const siteTimeout = timeoutMs ?? Math.max(10000, b.seconds * 5000);
  let restored = true;
  let testSeconds = b.seconds;
  for (const s of sites) {
    if (s.verdict !== "planned") continue;
    if (!baseline.passed) { s.verdict = "notRun"; s.reason = "baselineFailed"; continue; }
    if (Date.now() - t0 > budgetMs) { budget.exceeded = true; s.verdict = "notRun"; s.reason = "budget"; continue; }
    if (!(await judgeSite(s, files.get(s.file).text, { runner, patcher, timeoutMs: siteTimeout, noTests: siteNoTests, workers: adapter.next() }))) restored = false;
    testSeconds += s.seconds;
  }
  return { baseline, budget, restored, timing: selfTiming(t0, testSeconds), adaptation: adapter.state };
}

/** 不自适应：并行度沿用运行器创建时的，状态记 null。 */
const NO_ADAPTER = { next: () => null, state: null };

/** 存活位点的事实一句：只说发生了什么，怎么处置归读的人。字段名沿用 suggestion（I-1）。 */
const suggestion = (s) => (s.mutant === "" ? `删去 ${s.original} 后测试仍过` : `${s.original} 换成 ${s.mutant} 后测试仍过`);

/** 测量无效的原因：基线不通过；或一个位点都没有执行（杀死加存活为 0），按情形分没有位点、全部无覆盖、没有执行。有效返回 null。 */
function invalidReasonOf(summary, baselinePassed) {
  if (!baselinePassed) return "基线不通过";
  if (summary.killed + summary.survived > 0) return null;
  if (summary.total === 0) return "没有位点";
  return summary.uncovered === summary.total ? "全部位点无覆盖" : "没有执行任何位点";
}

/**
 * 汇总与存活清单。timedOut 是杀死里因超时的位点数，单列是因为超时可能是机器慢而不是测试强。
 * valid 为 false 时 score 为 null，抬头不出计数：没有执行过的测量不能写成「杀死 0、存活 0」。只列时 valid 为 null。
 */
export function summarize(sites, { planOnly = false, baselinePassed = true } = {}) {
  const count = (v) => sites.filter((s) => s.verdict === v).length;
  const byReason = (r) => sites.filter((s) => s.reason === r).length;
  const summary = { total: sites.length, killed: count("killed"), survived: count("survived"), uncovered: count("uncovered"), notRun: count("notRun"), planned: count("planned"), timedOut: byReason("timeout"), carried: byReason("carried"), score: score(sites), valid: null, invalidReason: null };
  if (!planOnly) {
    summary.invalidReason = invalidReasonOf(summary, baselinePassed);
    summary.valid = summary.invalidReason === null;
    if (!summary.valid) summary.score = null;
  }
  const survivors = sites.filter((s) => s.verdict === "survived").map((s) => ({ file: s.file, unit: s.unit, line: s.line, original: s.original, mutant: s.mutant, category: s.category, suggestion: suggestion(s) }));
  return { summary, survivors };
}

const VERDICT_TEXT = { planned: "待跑", killed: "杀死", survived: "存活", uncovered: "无覆盖", notRun: "未跑" };

const siteRow = (s) => `| ${s.file} | ${s.unit} | ${s.line} | \`${s.original}\` | \`${s.mutant === "" ? "（删去）" : s.mutant}\` | ${s.category} | ${VERDICT_TEXT[s.verdict]}${s.reason ? `（${s.reason}）` : ""} |`;

/** 抬头的计数部分：只列、四类计数与分数、其中超时、预算用尽。 */
function tallyText(result) {
  const sm = result.summary;
  if (result.planOnly) return "（只列）";
  if (sm.valid === false) return `：测量无效（${sm.invalidReason}）`;
  const score = sm.score === null ? "无" : (sm.score * 100).toFixed(0) + "%";
  const timedOut = sm.timedOut ? `（其中超时 ${sm.timedOut}）` : "";
  const carried = sm.carried ? `；沿用 ${sm.carried}` : "";
  return `：杀死 ${sm.killed}${timedOut}、存活 ${sm.survived}、无覆盖 ${sm.uncovered}、未跑 ${sm.notRun}；分数 ${score}${carried}${result.budget.exceeded ? "；预算用尽" : ""}`;
}

/** 抬头之后关于基线的说明：不通过的尾巴；「没跑测试」模式在基线上也命中。 */
function baselineNotes(result) {
  if (result.planOnly) return [];
  const notes = [];
  if (!result.baseline.passed) notes.push(`基线不通过：\n${result.baseline.tail}`);
  if (result.baseline.patternHit) notes.push("「没跑测试」模式在基线输出上也命中，判不出没跑测试，位点按通过处理");
  if (result.history?.given && !result.history.used) notes.push(`历史未沿用：${result.history.reason}`);
  return notes;
}

/** 人读的表格。 */
/** 抬头：基线、点名文件数、位点数与计数。 */
function headLine(result) {
  const pinned = result.pinned?.length ? `（点名 ${result.pinned.length} 个文件）` : "";
  return `差分变异：基线 ${baseLabel(result.base, result.baseGiven)} 到工作树${pinned}；位点 ${result.summary.total}${tallyText(result)}`;
}

/** 表格后的两段清单：存活的位点、没有位点的改动段。 */
function trailingLists(result) {
  const lines = [];
  if (result.survivors.length) {
    lines.push("", "存活的位点：");
    for (const s of result.survivors) lines.push(`- ${s.file}:${s.line} ${s.unit}：${s.suggestion}`);
  }
  if (result.unmutated?.length) {
    lines.push("", "没有位点的改动段（不进分数）：");
    for (const u of result.unmutated) lines.push(`- ${u.file}:${u.lines[0]}-${u.lines[1]}${u.unit ? ` ${u.unit}` : ""}：${u.reason}`);
  }
  return lines;
}

export function formatMutation(result) {
  const { sites } = result;
  const lines = [headLine(result), ...baselineNotes(result)];
  lines.push("| 文件 | 单元 | 行 | 原文 | 替换 | 类别 | 裁定 |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const s of sites) lines.push(siteRow(s));
  if (sites.length === 0) lines.push("| | 没有位点 | | | | | |");
  lines.push(...trailingLists(result));
  if (result.resources) lines.push("", formatResources(result.resources));
  return lines.join("\n");
}

/** 跑过位点之后才有的说明：运行中降档、机器繁忙、自身开销。 */
function runtimeNotes(r) {
  const notes = [];
  const a = r.adaptation;
  if (a && a.downshifts > 0) notes.push(`运行中按负载降档 ${a.downshifts} 次、升档 ${a.upshifts} 次，最低并行度 ${a.minWorkers}`);
  if (a && a.busy) notes.push(`机器繁忙：负载比持续高于上限 ${r.loadCeiling}，并行度已降到 1，耗时不代表工具本身`);
  if (r.timing) notes.push(`测试命令共 ${r.timing.testSeconds}s，总耗时 ${r.timing.totalSeconds}s，工具自身开销 ${Math.round(r.timing.overheadRatio * 100)}%`);
  return notes;
}

/** 一行资源摘要。 */
export function formatResources(r) {
  const notes = [];
  if (r.capped) notes.push(`显式 --workers ${r.requested} 超过份额上限，按份额降到 ${r.workers}`);
  if (r.halved) notes.push(`可用内存 ${r.capacity.freeMemMb} MB 低于 ${r.lowMemoryHalveMb} MB，上限减半`);
  if (r.nice === null) notes.push("本平台不降优先级");
  notes.push(...runtimeNotes(r));
  return `资源：${r.capacity.cpus} 核，负载 ${r.capacity.load1}，同机另有 ${r.otherHeavyTasks} 个重型任务，份额 ${Math.round(r.share * 100)}%，并行度 ${r.workers}${r.nice === null ? "" : `，nice ${r.nice}`}${notes.length ? "；" + notes.join("；") : ""}`;
}
