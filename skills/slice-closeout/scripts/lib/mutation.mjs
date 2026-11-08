// 差分变异的逻辑：收集位点、覆盖门控与历史沿用、逐位点裁定、汇总与格式化。模型见 ../../metrics-model.md。
// 不读 argv，不 exit。进程生命周期（信号、退出码）归命令面；写入器与测试运行器在这里，命令面拿着它们做还原与中断。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { cpus, freemem, loadavg } from "node:os";
import { changedLines, inScope, lookupFile, nestedUnits, ownLines, unitDigests, score, baseLabel } from "./core.mjs";

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

export const TEST_FILE_RE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
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

/** 收集基线到工作树改动单元的全部位点。返回 { files: path → { text, units, digests }, sites }。 */
export function collectSites({ root, base, ts, scope }) {
  const files = new Map();
  const sites = [];
  for (const [path, ranges] of changedLines(root, base)) {
    if (!isMutable(root, path, scope)) continue;
    const text = readFileSync(join(root, path), "utf8");
    const { sourceFile, units } = analyze(ts, path, text);
    const digests = unitDigests(text, units);
    files.set(path, { text, units, digests });
    for (const unit of units) {
      const own = unit.name === "<module>" ? null : changedOwnLines(unit, units, ranges);
      if (!own) continue;
      for (const s of findSites(ts, sourceFile, text, unit, own)) sites.push({ file: path, unit: unit.name, digest: digests.get(unit.name), ...s, verdict: "planned", reason: null, runs: 0, seconds: null });
    }
  }
  sites.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
  for (const s of sites) s.id = `${s.file}:${s.line}:${s.start}:${s.category}`;
  return { files, sites };
}

/** 位点所在行或所在语句行有执行记录。没有 lcov 时一律算有覆盖。 */
export function isCovered(report, s) {
  if (!report) return true;
  const rec = lookupFile(report, s.file);
  if (!rec) return false;
  const hit = (l) => (rec.lines.get(l)?.[0] ?? 0) > 0 || (rec.branches.get(l)?.[0] ?? 0) > 0;
  return hit(s.line) || hit(s.anchorLine);
}

/** 选择：无覆盖的标 uncovered；上次已杀死且单元摘要未变的沿用 killed。原地改。 */
export function selectSites(sites, report, history) {
  const prior = new Map((history?.sites ?? []).map((s) => [s.id, s]));
  for (const s of sites) {
    if (!isCovered(report, s)) { s.verdict = "uncovered"; continue; }
    const p = prior.get(s.id);
    if (p && p.digest === s.digest && p.verdict === "killed") { s.verdict = "killed"; s.reason = "carried"; }
  }
}

/** 写入器：一次只写一个文件，记住原文；还原后逐字节核对，返回是否一致。没有待还原的也返回 true。 */
export function createPatcher(root) {
  let applied = null;
  return {
    apply(path, original, mutated) { applied = { path, original }; writeFileSync(join(root, path), mutated); },
    restore() {
      if (!applied) return true;
      const target = join(root, applied.path);
      writeFileSync(target, applied.original);
      const ok = readFileSync(target, "utf8") === applied.original;
      applied = null;
      return ok;
    },
  };
}

/** 能不能降优先级：Linux 与 macOS 用 nice；Windows 不设。 */
export const niceAvailable = () => process.platform !== "win32";

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
      child.on("close", (code) => { clearTimeout(timer); child = null; done({ code, timedOut, output, seconds: (Date.now() - t0) / 1000 }); });
    }),
    kill: () => { if (child) killGroup(child); },
  };
}

const killGroup = (child) => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };

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
    if (r.timedOut || r.code !== 0) { s.verdict = "killed"; s.reason = r.timedOut ? "timeout" : null; break; }
    if (noTests.test(r.output)) { s.verdict = "notRun"; s.reason = "noTests"; continue; }
    s.verdict = "survived"; s.reason = null; break;
  }
  s.seconds = Math.round(seconds * 100) / 100;
  return restored;
}

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
  const baseline = { passed: b.code === 0 && !b.timedOut, seconds: b.seconds, tail: b.output.split("\n").slice(-5).join("\n") };
  const budget = { limitMs: budgetMs, exceeded: false };
  const siteTimeout = timeoutMs ?? Math.max(10000, b.seconds * 5000);
  let restored = true;
  let testSeconds = b.seconds;
  for (const s of sites) {
    if (s.verdict !== "planned") continue;
    if (!baseline.passed) { s.verdict = "notRun"; s.reason = "baselineFailed"; continue; }
    if (Date.now() - t0 > budgetMs) { budget.exceeded = true; s.verdict = "notRun"; s.reason = "budget"; continue; }
    if (!(await judgeSite(s, files.get(s.file).text, { runner, patcher, timeoutMs: siteTimeout, noTests, workers: adapter.next() }))) restored = false;
    testSeconds += s.seconds;
  }
  return { baseline, budget, restored, timing: selfTiming(t0, testSeconds), adaptation: adapter.state };
}

/** 不自适应：并行度沿用运行器创建时的，状态记 null。 */
const NO_ADAPTER = { next: () => null, state: null };

const suggestion = (s) => (s.mutant === "" ? `删去 ${s.original} 后测试仍过：补一条能区分有无 ${s.original} 的断言，或说明它为什么等价` : `${s.original} 换成 ${s.mutant} 后测试仍过：补一条在边界上能区分两者的断言，或说明它为什么等价`);

/** 汇总与存活清单。 */
export function summarize(sites) {
  const count = (v) => sites.filter((s) => s.verdict === v).length;
  const summary = { total: sites.length, killed: count("killed"), survived: count("survived"), uncovered: count("uncovered"), notRun: count("notRun"), planned: count("planned"), score: score(sites) };
  const survivors = sites.filter((s) => s.verdict === "survived").map((s) => ({ file: s.file, unit: s.unit, line: s.line, original: s.original, mutant: s.mutant, category: s.category, suggestion: suggestion(s) }));
  return { summary, survivors };
}

const VERDICT_TEXT = { planned: "待跑", killed: "杀死", survived: "存活", uncovered: "无覆盖", notRun: "未跑" };

const siteRow = (s) => `| ${s.file} | ${s.unit} | ${s.line} | \`${s.original}\` | \`${s.mutant === "" ? "（删去）" : s.mutant}\` | ${s.category} | ${VERDICT_TEXT[s.verdict]}${s.reason ? `（${s.reason}）` : ""} |`;

/** 人读的表格。 */
export function formatMutation(result) {
  const { sites, summary: sm, base } = result;
  const tally = result.planOnly ? "（只列）" : `：杀死 ${sm.killed}、存活 ${sm.survived}、无覆盖 ${sm.uncovered}、未跑 ${sm.notRun}；分数 ${sm.score === null ? "无" : (sm.score * 100).toFixed(0) + "%"}`;
  const lines = [`差分变异：基线 ${baseLabel(base, result.baseGiven)} 到工作树；位点 ${sm.total}${tally}${result.budget.exceeded ? "；预算用尽" : ""}`];
  if (!result.planOnly && !result.baseline.passed) lines.push(`基线不通过：\n${result.baseline.tail}`);
  lines.push("| 文件 | 单元 | 行 | 原文 | 替换 | 类别 | 裁定 |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const s of sites) lines.push(siteRow(s));
  if (sites.length === 0) lines.push("| | 没有位点 | | | | | |");
  if (result.survivors.length) {
    lines.push("", "存活的位点：");
    for (const s of result.survivors) lines.push(`- ${s.file}:${s.line} ${s.unit}：${s.suggestion}`);
  }
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
