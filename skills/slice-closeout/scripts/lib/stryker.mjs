// Stryker 引擎的适配层：找依赖、认运行器、选引擎；范围变 mutate 条目与配置、起进程；读报告、映射回位点模型。
// 核心层 core.mjs 与适配器 adapter-typescript.mjs 不知道引擎；mutation.mjs 只在这里拿引擎的决定。
import { existsSync, readFileSync, readdirSync, createWriteStream, writeFileSync, realpathSync, statSync, symlinkSync } from "node:fs";
import { join, resolve, relative, isAbsolute, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { unitDigests, testFilesDigest, ownLines, nestedUnits } from "./core.mjs";
import { TOOL_VERSION } from "./version.mjs";
import { analyze } from "./adapter-typescript.mjs";
import { UNRECHECKED } from "./mutation.mjs";

/** 脚本目录自带的 node_modules：`scripts/package.json` 钉版本，`npm ci --prefix <脚本目录>` 装到这里。 */
export const SCRIPTS_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const SCRIPTS_MODULES = join(SCRIPTS_DIR, "node_modules");
const CORE = "@stryker-mutator/core";
const RUNNER = "@stryker-mutator/vitest-runner";
const RUNNER_CONFIG_RE = /^(vitest|vite)\.config\.[cm]?[jt]s$/;

const readPackage = (dir) => { const p = join(dir, "package.json"); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null; };

/** runner 包的入口文件绝对路径：exports 的「.」项（字符串，或对象的 import、default），没有取 main，再没有取 dist/src/index.js。 */
export function runnerEntryOf(runnerDir, pkg) {
  const dot = pkg.exports?.["."];
  const relative = typeof dot === "string" ? dot : dot?.import ?? dot?.default ?? pkg.main ?? "dist/src/index.js";
  return resolve(runnerDir, relative);
}

/** 一个 node_modules 目录里核心与 vitest runner 都在才算找到。runnerEntry 是 runner 入口文件的绝对路径，写进 Stryker 配置的 plugins。 */
function probe(modulesDir, from) {
  const core = readPackage(join(modulesDir, CORE));
  const runner = readPackage(join(modulesDir, RUNNER));
  if (!core || !runner) return null;
  const vitest = readPackage(join(modulesDir, "vitest"));
  return { modulesDir, from, version: core.version, runnerVersion: runner.version, vitestVersion: vitest?.version ?? null, coreBin: join(modulesDir, CORE, core.bin?.stryker ?? "bin/stryker.js"), runnerEntry: runnerEntryOf(join(modulesDir, RUNNER), runner) };
}

/**
 * 项目目录：不给是 Git 根，前缀为空；给了按 Git 根解析相对路径，须在根内、存在、是目录，否则抛错（命令面退出 2）。
 * 返回 { dir, prefix, label }：dir 是绝对路径，prefix 是 Git 根相对、以 / 分隔的成员目录，Stryker 边界上靠它换算路径；label 进 JSON 的 project，不给为 null，给的是 Git 根为「.」。
 */
export function resolveProject(root, value = null) {
  if (value === null) return { dir: root, prefix: "", label: null };
  const abs = isAbsolute(value) ? value : resolve(root, value);
  if (!existsSync(abs)) throw new Error(`--project 不存在：${value}`);
  const dir = realpathSync(abs);
  const rel = relative(realpathSync(root), dir);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`--project 在 Git 根之外：${value}`);
  if (!statSync(dir).isDirectory()) throw new Error(`--project 不是目录：${value}`);
  const prefix = rel.split(sep).join("/");
  return { dir, prefix, label: prefix || "." };
}

/** Git 根相对路径在不在项目目录下；前缀为空（项目就是 Git 根）时都在。 */
export const inProject = ({ prefix }, path) => !prefix || path.startsWith(`${prefix}/`);

/** 查找的目录，按顺序：项目根 node_modules → Git 根 node_modules（项目不是 Git 根时）→ 指定目录（--stryker-modules 或 PQW_STRYKER_MODULES）→ 脚本目录。 */
export const searchDirs = ({ root, repoRoot = root, modulesDir = null, env = process.env, scriptsModules = SCRIPTS_MODULES }) =>
  [[join(root, "node_modules"), "项目 node_modules"], [repoRoot === root ? null : join(repoRoot, "node_modules"), "Git 根 node_modules"], [modulesDir ?? env.PQW_STRYKER_MODULES ?? null, "指定目录"], [scriptsModules, "脚本目录 node_modules"]].filter(([dir]) => dir).map(([dir, from]) => [resolve(dir), from]);

/** 按 searchDirs 的顺序找，返回第一处找到的 { modulesDir, from, version, runnerVersion, vitestVersion, coreBin }；都没有返回 null。 */
export function resolveStryker(where) {
  for (const [dir, from] of searchDirs(where)) { const found = probe(dir, from); if (found) return found; }
  return null;
}

/** 认项目的测试运行器：根下有 vitest.config.* 或 vite.config.*，或 package.json 声明 vitest，算 vitest；别的都不认。 */
export function detectRunner(root) {
  const config = existsSync(root) ? readdirSync(root).filter((n) => RUNNER_CONFIG_RE.test(n)).sort()[0] : undefined;
  if (config) return { name: "vitest", configFile: config, evidence: `项目根有 ${config}` };
  const pkg = readPackage(root);
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if ("vitest" in deps) return { name: "vitest", configFile: null, evidence: "package.json 声明了 vitest" };
  return null;
}

const installHint = (dirs) => `找不到 Stryker：${dirs.map(([d]) => d).join("、")} 里都没有 ${CORE} 与 ${RUNNER}；装法：项目里 npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner，或 npm ci --prefix ${SCRIPTS_DIR}，或用 --stryker-modules / PQW_STRYKER_MODULES 指向装好的 node_modules`;

/**
 * 选引擎：只有 Stryker。返回 { name, version, runner, reason, modules, configFile }，前四项进抬头与 JSON；项目不是 vitest 或找不到依赖抛错（.code = "unavailable"），命令面退出 2。
 * configFile 是调用方指定的 vitest 配置（相对项目目录或绝对路径，例如只跑快层的那份），给了就不再自动找。
 */
export function chooseEngine({ root, repoRoot = root, modulesDir = null, env = process.env, scriptsModules = SCRIPTS_MODULES, configFile = null }) {
  const where = { root, repoRoot, modulesDir, env, scriptsModules };
  const runner = configFile ? { name: "vitest", configFile, evidence: `指定了 --vitest-config ${configFile}` } : detectRunner(root);
  if (!runner) { const e = new Error("项目没有 vitest 配置也没有声明 vitest：本工具只支持 vitest 项目（jest、node:test 等暂不支持）"); e.code = "unavailable"; throw e; }
  const found = resolveStryker(where);
  if (!found) { const e = new Error(installHint(searchDirs(where))); e.code = "unavailable"; throw e; }
  return { name: "stryker", version: found.version, runner: runner.name, reason: `${runner.evidence}；Stryker ${found.version} 取自${found.from}`, modules: found, configFile: runner.configFile };
}

/** 连续的行号合并成闭区间。 */
const segments = (lines) => lines.reduce((acc, l) => { const last = acc[acc.length - 1]; if (last && last[1] === l - 1) last[1] = l; else acc.push([l, l]); return acc; }, []);

/** 单元自有行数超过它时只变异改动行与包住它的最小嵌套函数（--unit-max-lines 的缺省）。 */
export const DEFAULT_UNIT_MAX_LINES = 200;

/** 行 → 拥有它的有名单元（单元自己的行，扣掉嵌套单元；<module> 不算）。 */
function lineOwners(units) {
  const owner = new Map();
  for (const u of units) if (u.name !== "<module>") for (const l of ownLines(u, nestedUnits(u, units))) owner.set(l, u);
  return owner;
}

const ownCount = (owner, u) => [...owner.values()].filter((o) => o === u).length;

/**
 * 改动段扩成「改动行所在单元自己的全部行」：改动行落在哪个有名单元自己的行上，就把那个单元自己的行（扣掉嵌套单元）全算进来；
 * 那个单元自有行数超过 maxLines 时不取整个单元，只取包住改动行的最小嵌套函数（spans 是全部函数的行区间，匿名回调也在内）里归它的行，
 * 没有这样的函数或它也超过 maxLines 时只取改动行。不在任何有名单元里的改动行原样保留。返回合并后的闭区间列表。
 */
export function unitRanges(units, ranges, { maxLines = DEFAULT_UNIT_MAX_LINES, spans = [] } = {}) {
  const owner = lineOwners(units);
  const lines = new Set();
  const addOwned = (u, a, b) => { for (let x = a; x <= b; x++) if (owner.get(x) === u) lines.add(x); };
  for (const [a, b] of ranges) for (let l = a; l <= b; l++) {
    const u = owner.get(l);
    if (!u) { lines.add(l); continue; }
    if (ownCount(owner, u) <= maxLines) { addOwned(u, u.startLine, u.endLine); continue; }
    const inner = spans.filter(([s, e]) => s <= l && l <= e && s >= u.startLine && e <= u.endLine && !(s === u.startLine && e === u.endLine)).sort((x, y) => (x[1] - x[0]) - (y[1] - y[0]))[0];
    if (inner && inner[1] - inner[0] + 1 <= maxLines) addOwned(u, inner[0], inner[1]);
    else lines.add(l);
  }
  return segments([...lines].sort((x, y) => x - y));
}

/** 改动行碰到的、自有行数超过 maxLines 而被 unitRanges 收窄的单元：[{ unit, ownLines }]，按首次碰到的顺序。 */
export function largeUnits(units, ranges, maxLines = DEFAULT_UNIT_MAX_LINES) {
  const owner = lineOwners(units);
  const touched = new Set();
  for (const [a, b] of ranges) for (let l = a; l <= b; l++) if (owner.has(l)) touched.add(owner.get(l));
  return [...touched].map((u) => ({ unit: u.name, ownLines: ownCount(owner, u) })).filter((u) => u.ownLines > maxLines);
}

/** 范围变 mutate 条目：点名文件整份写路径；改动文件每个改动段写 `路径:起-止`。输入是按文件的闭区间 Map 与可变异的文件列表。 */
export function mutateEntries(changed, pinned, files) {
  const entries = [];
  for (const path of files) {
    if (pinned.includes(path)) { entries.push(path); continue; }
    for (const [a, b] of changed.get(path) ?? []) entries.push(`${path}:${a}-${b}`);
  }
  return entries;
}

/**
 * Stryker 的容器目录（tempDirName，相对项目目录）。沙箱是「容器/sandbox-随机名」，比容器深一层；容器放在项目上两级、名字带项目 slug，
 * 沙箱就与项目同深度，项目配置与测试里往上走两层及以上的相对路径在沙箱里照样成立，几个项目同时跑也不撞。
 * 项目就是 Git 根时沿用 .stryker-tmp；项目只深一层时上两级出了 Git 根，容器放根下，沙箱深一层，sameDepth 为 false。
 * 名字是成员目录（/ 换成 -）加成员目录的 8 位散列：只换字符不是一一对应（x/a-b 与 x-a/b 会撞），撞了的两个进程会互删对方的沙箱。
 * 返回 { name, path, sameDepth }：name 写进 Stryker 配置，path 是绝对路径，跑完与收到信号时删它。
 */
export function tempDirFor({ dir, prefix }) {
  const depth = prefix ? prefix.split("/").length : 0;
  const slug = `${prefix.replaceAll("/", "-")}-${createHash("sha256").update(prefix).digest("hex").slice(0, 8)}`;
  const name = depth === 0 ? ".stryker-tmp" : `${"../".repeat(Math.min(depth, 2))}.stryker-tmp-${slug}`;
  return { name, path: resolve(dir, name), sameDepth: depth !== 1 };
}

/** 抬头里关于项目与容器的说明行：给了成员时是哪个成员；成员外改动数；沙箱与成员不同深度；容器没被项目忽略。 */
export function projectNotes({ prefix = "", outside, temp, ignored }) {
  const container = basename(temp.path);
  return [
    ...(prefix ? [`项目：${prefix}`] : []),
    ...(outside > 0 ? [`成员外改动 ${outside} 个文件，不在本轮`] : []),
    ...(temp.sameDepth ? [] : [`沙箱比成员深一层：成员只在 Git 根下一层，容器只能放根下 ${container}，成员里往上走的相对路径在沙箱里会差一层`]),
    ...(ignored ? [] : [`\`${container}\` 没被项目忽略：跑完或被信号结束都会删，只有被强杀（SIGKILL）时留下，建议加进 .gitignore`]),
  ];
}

/** 本仓库在系统临时目录下的工作目录：配置、报告、日志、增量文件都放这里，不进项目。 */
export const workDir = (root) => join(tmpdir(), "pqw-mutation", createHash("sha256").update(root).digest("hex").slice(0, 16) + "-stryker");

// ---- 沙箱里构建：Stryker 10.1.1 建沙箱是复制文件、跑 buildCommand、再链 node_modules（core/dist/src/sandbox/sandbox.js 的 init），
// 构建时沙箱里还没有依赖。给了 --build-command 时关掉 Stryker 的链接，buildCommand 换成自带的包装脚本：先链 node_modules，再经 shell 跑用户的命令。

/** 包装脚本与它读的环境变量。Stryker 用 execaCommand 按空格切 buildCommand，路径里的空格要用反斜杠转义。 */
export const SANDBOX_BUILD = join(SCRIPTS_DIR, "sandbox-build.mjs");
export const buildCommandFor = (script) => `node ${script.replaceAll(" ", "\\ ")}`;
const SANDBOX_BUILD_COMMAND = buildCommandFor(SANDBOX_BUILD);
export const BUILD_ENV = { project: "PQW_PROJECT_DIR", command: "PQW_BUILD_COMMAND", mark: "PQW_BUILD_FAILED_MARK" };

/** 给 Stryker 进程的环境变量，包装脚本在沙箱里读它们；没给构建命令（undefined 或 null）时为空。 */
export const buildEnv = ({ projectDir, command, mark }) => (command == null ? {} : { [BUILD_ENV.project]: projectDir, [BUILD_ENV.command]: command, [BUILD_ENV.mark]: mark });

/**
 * 包装脚本的全部逻辑，在沙箱（cwd）里跑：项目目录有 node_modules 而沙箱里没有时链过去；经 shell 跑用户命令，输出照传；
 * 退出非零（或被信号结束）时写标记文件，命令面据此把「构建失败」与「初跑失败」分开。返回退出码。
 */
export function sandboxBuild({ cwd = process.cwd(), env = process.env, stdio = "inherit" } = {}) {
  const source = join(env[BUILD_ENV.project], "node_modules"), target = join(cwd, "node_modules");
  if (existsSync(source) && !existsSync(target)) symlinkSync(source, target, "junction");
  const r = spawnSync(env[BUILD_ENV.command], { cwd, env, shell: true, stdio });
  const code = r.status ?? 1;
  if (code !== 0) writeFileSync(env[BUILD_ENV.mark], `构建命令退出 ${r.status ?? r.signal}：${env[BUILD_ENV.command]}\n`);
  return code;
}

/** 没有报告时的基线：初跑不通过，带日志尾；构建失败（包装脚本留了标记）时多 buildFailed，没有构建失败时字段与 0.11.0 一致。 */
export const failedBaseline = ({ seconds, tail, logPath, buildFailed }) => ({ passed: false, seconds, tail: `${tail}\n（完整日志 ${logPath}）`, ...(buildFailed ? { buildFailed: true } : {}) });

/** 基线不通过时抬头写的原因。 */
export const baselineFailure = (baseline) => (baseline.buildFailed ? "构建失败" : "Stryker 初跑失败");

/**
 * Stryker 配置。并行度启动时定下；runnerEntry 是已经解析到的 vitest runner 入口的绝对路径，写成 plugins，
 * 不靠 Stryker 在核心旁边找 @stryker-mutator/*（pnpm 的隔离布局里核心的真实位置旁边没有 runner）；--timeout 给了就映射到 timeoutMS；增量按 incremental 参数（null 不开）。
 * Stryker 在项目目录里跑，条目要相对项目目录：这里是写方向的唯一换算处，去掉 prefix（读方向在 readReport）。
 */
export function strykerConfig({ entries, configFile, concurrency, reportPath, incremental = null, timeoutMs = null, tempDirName = ".stryker-tmp", prefix = "", build = false, runnerEntry = null }) {
  return {
    testRunner: "vitest",
    ...(runnerEntry ? { plugins: [runnerEntry] } : {}),
    vitest: { ...(configFile ? { configFile } : {}), related: false },
    coverageAnalysis: "perTest",
    mutate: prefix ? entries.map((e) => e.slice(prefix.length + 1)) : entries,
    tempDirName,
    cleanTempDir: true,
    ...(build ? { buildCommand: SANDBOX_BUILD_COMMAND, symlinkNodeModules: false } : {}),
    concurrency,
    ...(timeoutMs === null ? {} : { timeoutMS: timeoutMs }),
    ...(incremental ? { incremental: true, incrementalFile: incremental.file, force: incremental.force } : { incremental: false }),
    reporters: ["json", "progress-append-only"],
    jsonReporter: { fileName: reportPath },
    thresholds: { high: 80, low: 60, break: null },
  };
}

const PROGRESS_RE = /^Mutation testing \d+%/;
const REUSED_RE = /(\d+) of (\d+) mutant result\(s\) are reused/;
const DRY_RUN_RE = /Initial test run succeeded\..*net ([\d.]+) ms, overhead ([\d.]+) ms/;

/**
 * 在项目根起 Stryker：`node <core bin> run <配置>`，可包一层 nice。全部输出进日志文件，进度行另交 onProgress。
 * 返回 { status, signal, seconds, dryRunSeconds, reused, tail }；reused 从日志的增量摘要行取，没有为 null；dryRunSeconds 是初跑（未变异的一轮）用时，从日志取，没有为 null；tail 是日志末 20 行。
 * 返回的 kill() 给调用方转发信号。
 */
export function runStryker({ root, coreBin, configPath, nice = null, logPath, onProgress = () => {}, env = {} }) {
  const args = ["node", coreBin, "run", configPath];
  const cmd = nice === null ? args : ["nice", "-n", String(nice), ...args];
  const t0 = Date.now();
  const lines = [];
  const child = spawn(cmd[0], cmd.slice(1), { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env, FORCE_COLOR: "0", NO_COLOR: "1" } });
  const log = createWriteStream(logPath, { flags: "a" });
  let rest = "";
  const onData = (chunk) => {
    log.write(chunk);
    rest += chunk.toString();
    const parts = rest.split("\n"); rest = parts.pop();
    for (const raw of parts) { const line = raw.replace(/\x1b\[[0-9;]*m/g, ""); lines.push(line); if (PROGRESS_RE.test(line)) onProgress(line); }
  };
  child.stdout.on("data", onData); child.stderr.on("data", onData);
  log.on("error", () => {});
  // 日志流关完才算结束：调用方拿到结果就可能删目录，流还没打开就会在那之后报 ENOENT。
  const done = new Promise((resolve) => child.on("close", (status, signal) => {
    if (rest) lines.push(rest.replace(/\x1b\[[0-9;]*m/g, ""));
    const reused = lines.map((l) => REUSED_RE.exec(l)).find(Boolean);
    const dry = lines.map((l) => DRY_RUN_RE.exec(l)).find(Boolean);
    log.end(() => resolve({ status, signal, seconds: Math.round((Date.now() - t0) / 100) / 10, dryRunSeconds: dry ? Math.round(Number(dry[1]) + Number(dry[2])) / 1000 : null, reused: reused ? Number(reused[1]) : null, tail: lines.slice(-20).join("\n") }));
  }));
  return { done, kill: (sig = "SIGTERM") => child.kill(sig) };
}

/** `.stryker-tmp` 有没有被项目忽略；没被忽略时提醒，跑完会删，被杀时会留下。 */
export function tempDirIgnored(root, tempDirName = ".stryker-tmp") {
  const r = spawnSync("git", ["check-ignore", "-q", tempDirName], { cwd: root, stdio: "ignore" });
  return r.status === 0;
}

/** 读 JSON 报告；文件不在返回 null。报告的文件键相对 Stryker 的 cwd（项目目录）：这里是读方向的唯一换算处，加回 prefix 成 Git 根相对。 */
export function readReport(path, prefix = "") {
  if (!existsSync(path)) return null;
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (prefix && report.files) report.files = Object.fromEntries(Object.entries(report.files).map(([k, v]) => [`${prefix}/${k}`, v]));
  return report;
}

/** Stryker 状态到四类裁定；reason 记原因（超时记 timeout）。 */
const STATUS = {
  Killed: ["killed", null], Timeout: ["killed", "timeout"], Survived: ["survived", null], NoCoverage: ["uncovered", null],
  RuntimeError: ["notRun", "runtime error"], CompileError: ["notRun", "compile error"], Ignored: ["notRun", "ignored"], Pending: ["notRun", "pending"],
};
/** 变异器名到类别：去掉 Operator、Expression、Literal、Declaration、Statement 后缀，小写。 */
export const categoryOf = (mutatorName) => mutatorName.replace(/(Operator|Expression|Literal|Declaration|Statement|Chaining)$/, "").toLowerCase();

/** 1 起的行列到字节偏移。 */
function offsetOf(text, { line, column }) {
  let pos = 0;
  for (let i = 1; i < line; i++) { const nl = text.indexOf("\n", pos); if (nl < 0) return text.length; pos = nl + 1; }
  return pos + column - 1;
}

/** 单元表里没有 <module> 时（适配器只在顶层有判定、圈复杂度大于 1 时给）顶层变异体挂到这个占位上。 */
const MODULE_UNIT = { name: "<module>", startLine: 1, endLine: Infinity, startByte: 0 };
/** 行所在的最小有名单元；都不在就是 <module>。 */
const unitAt = (units, line) => units.filter((u) => u.name !== "<module>" && u.startLine <= line && line <= u.endLine).sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0] ?? units.find((u) => u.name === "<module>") ?? MODULE_UNIT;

/** 一个变异体变一个位点：单元按行找，原文按位置切，状态按表映射。 */
function mutantSite(path, entry, m, pinned) {
  const line = m.location.start.line;
  const unit = unitAt(entry.units, line);
  const start = offsetOf(entry.text, m.location.start), end = offsetOf(entry.text, m.location.end);
  const [verdict, reason] = STATUS[m.status] ?? ["notRun", `未知状态 ${m.status}`];
  const original = entry.text.slice(start, end);
  const category = categoryOf(m.mutatorName);
  return { id: `${path}:${unit.name}:${start - unit.startByte}:${category}:${m.replacement}`, file: path, unit: unit.name, digest: entry.digests?.get(unit.name) ?? null, line, anchorLine: line, start, end, original: original.length > 40 ? original.slice(0, 37) + "…" : original, mutant: m.replacement, category, pinned, verdict, reason, runs: m.testsCompleted ?? 0, seconds: m.duration === undefined ? null : Math.round(m.duration) / 1000, strykerId: m.id, unknownStatus: m.status in STATUS ? null : m.status };
}

/** 一个文件：点名的全收；否则只收落在改动段里的变异体，没有变异体的段记成未覆盖段。 */
function fileMutants(path, entry, mutants, ranges, isPinned) {
  if (isPinned) return { sites: mutants.map((m) => mutantSite(path, entry, m, true)), unmutated: [] };
  const sites = [];
  const hit = new Set();
  for (const m of mutants) {
    const i = ranges.findIndex(([a, b]) => a <= m.location.start.line && m.location.start.line <= b);
    if (i < 0) continue;
    hit.add(i);
    sites.push(mutantSite(path, entry, m, false));
  }
  const unitName = (line) => { const u = unitAt(entry.units, line); return !u || u.name === "<module>" ? null : u.name; };
  const unmutated = ranges.filter((_, i) => !hit.has(i)).map(([a, b]) => ({ file: path, lines: [a, b], unit: unitName(a), reason: "引擎没有在这段生成变异体" }));
  return { sites, unmutated };
}

/**
 * 报告映射成位点模型：files 是 path → { text, units, digests }，ranges 是 changedLines 的 Map，pinned 是点名的文件。
 * 返回 { sites, unmutated, unknown }，位点按文件与位置排序，字段按位点模型，另带 strykerId；unknown 是报告里映射表没有的状态名（去重），有就不能计分。
 */
export function mapReport({ report, files, ranges, pinned = [] }) {
  const sites = [];
  const unmutated = [];
  for (const [path, entry] of files) {
    const r = fileMutants(path, entry, report?.files?.[path]?.mutants ?? [], ranges.get(path) ?? [], pinned.includes(path));
    sites.push(...r.sites);
    unmutated.push(...r.unmutated);
  }
  sites.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
  return { sites, unmutated, unknown: [...new Set(sites.map((s) => s.unknownStatus).filter(Boolean))] };
}

/** 几个目录（相对 root）里全部文件的路径与内容按路径排序后取 sha256，不进 node_modules；目录不在也记一笔，有无之变同样算变。 */
export function dirsDigest(root, dirs) {
  const hash = createHash("sha256");
  const walk = (abs, rel) => {
    if (!existsSync(abs)) hash.update(`${rel}\0（不在）\0`);
    else if (!statSync(abs).isDirectory()) hash.update(rel).update("\0").update(readFileSync(abs)).update("\0");
    else for (const n of readdirSync(abs).sort()) if (n !== "node_modules") walk(join(abs, n), `${rel}/${n}`);
  };
  for (const d of dirs) walk(resolve(root, d), d);
  return hash.digest("hex");
}

/**
 * Stryker 引擎下的指纹：工具版本、「vitest@<版本> + <配置文件>」当测试命令、测试文件摘要、Stryker 版本、测试配置文件的内容摘要（没有配置文件为 null）；
 * 给了 buildOutputs（有构建命令时的产物目录，相对 root）再加它们的内容摘要。任一项变了上次的结果就不能再信。
 */
export function strykerFingerprint(root, engine, { buildOutputs = null } = {}) {
  const config = engine.configFile ? resolve(root, engine.configFile) : null;
  return {
    toolVersion: TOOL_VERSION, testCommand: `vitest@${engine.modules.vitestVersion ?? "?"} + ${engine.configFile ?? "无配置"}`, testFilesDigest: testFilesDigest(root), strykerVersion: engine.version,
    testConfigDigest: config && existsSync(config) ? createHash("sha256").update(readFileSync(config)).digest("hex") : null,
    ...(buildOutputs ? { buildOutputDigest: dirsDigest(root, buildOutputs) } : {}),
  };
}

const sameFingerprint = (a, b) => a !== null && JSON.stringify(a) === JSON.stringify(b);

/** 增量参数：增量文件在工作目录；上次记的指纹与这次不同（或没有记录）就 force 整轮重跑。 */
export function incrementalFor(dir, fingerprint) {
  const recordPath = join(dir, "fingerprint.json");
  let previous = null;
  try { previous = JSON.parse(readFileSync(recordPath, "utf8")); } catch { previous = null; }
  return { file: join(dir, "incremental.json"), force: !sameFingerprint(previous, fingerprint), previous };
}

/** 跑完记下这次的指纹，下次据此判要不要 force。 */
export const rememberFingerprint = (dir, fingerprint) => writeFileSync(join(dir, "fingerprint.json"), JSON.stringify(fingerprint, null, 2) + "\n");

/** 映射要用的文件表：path → { text, units, spans, digests }；单元与函数区间由现有适配器按行找。 */
export function fileEntries(root, ts, files) {
  return new Map(files.map((path) => { const text = readFileSync(join(root, path), "utf8"); const { units, spans } = analyze(ts, path, text); return [path, { text, units, spans, digests: unitDigests(text, units) }]; }));
}

// ---- 超时复核：第一轮超时的变异体所在的整行再跑一轮，结果按位点 id 并入。

/**
 * 第一轮报告里超时变异体所在的整行范围，作第二轮的 mutate 条目 `路径:起行-止行`，相邻行合并；只看 files 里的文件、本轮范围内（或点名文件）的变异体：
 * 开着增量时 Stryker 会把上一轮范围外的结果也写进报告，它们不是本轮的位点。用整行而不是行列，避开列号基数的歧义；同行别的变异体顺带再跑，并入时只认超时的那些。
 * only 是要复核的变异体 id（limitRecheck 的结果），null 不限。
 */
export function timeoutEntries(report, files, ranges = new Map(), pinned = [], only = null) {
  const entries = [];
  for (const path of files.keys()) {
    const inRange = (line) => pinned.includes(path) || (ranges.get(path) ?? []).some(([a, b]) => a <= line && line <= b);
    const lines = new Set();
    for (const m of report?.files?.[path]?.mutants ?? []) if (m.status === "Timeout" && inRange(m.location.start.line) && (only === null || only.has(m.id))) for (let l = m.location.start.line; l <= m.location.end.line; l++) lines.add(l);
    for (const [a, b] of segments([...lines].sort((x, y) => x - y))) entries.push(`${path}:${a}-${b}`);
  }
  return entries;
}

/** 超时复核的上限：按位点顺序取前 limit 个超时位点去复核，返回它们的变异体 id；其余记未跑「超时未复核」，使成员测量无效。 */
export function limitRecheck(sites, limit) {
  const kept = new Set();
  for (const s of sites) {
    if (s.reason !== "timeout") continue;
    if (kept.size < limit) kept.add(s.strykerId);
    else [s.verdict, s.reason] = ["notRun", UNRECHECKED];
  }
  return kept;
}

const RECHECK = { Killed: ["killed", "recheck"], Survived: ["survived", "recheck"], Timeout: ["killed", "timeout"] };

/**
 * 把第二轮报告并进位点：只动第一轮超时的位点，按位点 id（文件、单元内偏移、类别、替换）对上，两轮之间 Stryker 重新编号所以不用它的 id。
 * Killed、Survived 改裁定、原因记 recheck；仍 Timeout 保持；别的状态或没对上记未复核、裁定不动。返回复核计数与报告里映射表没有的状态（它们使测量无效，与第一轮同）。
 */
export function mergeRecheck(sites, recheckReport, files) {
  const found = new Map();
  const unknown = new Set();
  for (const [path, entry] of files) for (const m of recheckReport?.files?.[path]?.mutants ?? []) { found.set(mutantSite(path, entry, m, false).id, m.status); if (!(m.status in STATUS)) unknown.add(m.status); }
  const r = { total: 0, killed: 0, survived: 0, timedOut: 0, notRun: 0, unknown: [...unknown] };
  for (const s of sites) {
    if (s.reason !== "timeout") continue;
    r.total++;
    const status = found.get(s.id);
    if (!(status in RECHECK)) { r.notRun++; continue; }
    [s.verdict, s.reason] = RECHECK[status];
    r[status === "Killed" ? "killed" : status === "Survived" ? "survived" : "timedOut"]++;
  }
  return r;
}
