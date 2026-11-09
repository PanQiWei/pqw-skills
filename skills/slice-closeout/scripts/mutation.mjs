#!/usr/bin/env node
// 差分变异：基线到工作树的改动行所在的函数，交给 Stryker 打变异体、跑碰到它的用例，裁定为杀死、存活、无覆盖、未跑四类；超时的变异体单独复核。
// 模型见 ../metrics-model.md；位点模型与读数在 lib/mutation.mjs，Stryker 适配在 lib/stryker.mjs，本文件是命令面与进程生命周期。
// 用法与每个参数的含义见 --help。退出 0 正常；1 初跑不通过；2 用法错误、未提供 typescript、项目不是 vitest 或找不到 Stryker；129 收到 SIGHUP、130 被中断、143 被终止。
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs, parseScope, resolveBase, sh, changedLines } from "./lib/core.mjs";
import { loadTypescript } from "./lib/adapter-typescript.mjs";
import { resolveProject, inProject, tempDirFor, projectNotes, buildEnv, failedBaseline, baselineFailure, chooseEngine, mutateEntries, unitRanges, workDir, strykerConfig, runStryker, tempDirIgnored, readReport, mapReport, fileEntries, strykerFingerprint, incrementalFor, rememberFingerprint, timeoutEntries, mergeRecheck } from "./lib/stryker.mjs";
import { parseDuration, summarize, formatMutation, capacity, plannedWorkers, niceAvailable, isMutable } from "./lib/mutation.mjs";

const USAGE = `用法：mutation.mjs [选项]
只打基线到工作树改动行所在函数的变异体，由 Stryker 执行：一次插桩、测试进程常驻、每个变异体只跑碰到它的用例、几个进程并行、增量复用。项目要用 vitest（根下有 vitest.config.* 或 vite.config.*，或 package.json 声明了 vitest）且找得到 Stryker 与它的 vitest runner；不满足退出 2 并说明。

  --repo <目录>              仓库里任一目录，缺省当前目录
  --project <目录>           多包仓库的一个成员目录（Git 根相对或绝对路径）：在那里认 vitest、找 Stryker、起 Stryker，只取它下面的改动文件；
                             输出里的路径仍相对 Git 根，成员外的改动在抬头计数。改动跨几个成员时按成员各调一次。缺省是 Git 根
  --build-command <命令>     测试导入构建产物（如 dist/）时给：Stryker 建好沙箱后、跑测试前，先把项目的 node_modules 链进沙箱，
                             再在沙箱里经 shell 跑这条命令（可用 && 与管道），让产物来自插桩后的源码；失败时抬头写「测量无效（构建失败）」
  --base <ref>               基线提交；缺省取与 --target 的合并点。给的 ref 不是 HEAD 的祖先（基线分支前进过）时改用两者的合并点，抬头与 JSON 的 baseGiven 写明
  --target <分支>            缺省依次试 main、master
  --ts <目录>                typescript 包目录（要 JS 实现，6.x 可用）；缺省从仓库 node_modules 找。只用来按行找函数，不参与变异
  --scope <前缀,前缀>        只看这些路径前缀
  --files <路径,路径>        点名文件：这些文件整份都打，不论改没改（判据、状态机所在的文件）；抬头写「（点名 N 个文件）」，位点带 pinned
  --json <路径>              结果 JSON 写到这里；--format json 直接打印 JSON
  --plan-only                只列 mutate 条目，不起 Stryker
  --timeout <时长>           Stryker 的 timeoutMS（在它按初跑估算的时限上再加的毫秒数）；缺省用 Stryker 的缺省
  --stryker-modules <目录>   装了 @stryker-mutator/core 与 vitest-runner 的 node_modules；解析顺序是项目根 node_modules、这里（也读环境变量 PQW_STRYKER_MODULES）、本脚本目录的 node_modules（npm ci --prefix 该目录）

资源。算式：份额 = 1 / (--other-heavy-tasks + 1)；上限 = max(1, floor(CPU 数 × 份额))，可用内存低于阈值时减半；并行度 = 缺省等于上限，显式 --workers 超过上限按上限；写进 Stryker 配置的 concurrency，启动时定下，运行中不调。
  --other-heavy-tasks N      这台机器上除本工具外同时在跑的重型任务数，缺省 0；N=1 时本工具只拿一半 CPU
  --workers N                并行度，缺省等于上限
  --low-memory-halve <MB>    可用内存低于这个数时上限减半，缺省 2048
  --no-nice                  不降低 Stryker 进程的优先级；缺省 nice 10，Windows 不降

增量：Stryker 的 incremental 文件在系统临时目录的工作目录里，指纹（工具版本、vitest 版本与配置文件、测试文件摘要、Stryker 版本）变了整轮重跑，抬头写「沿用 N」。

复核：第一轮有超时的变异体时再起一轮，只打它们所在的行，一个进程、时限放宽、不进增量；结果并回位点，抬头写「复核 N（超时转杀死 a、存活 b、仍超时 c）」。超时常是机器忙而不是测试强，复核过的分数才可信。
  --no-recheck               不起第二轮
  --recheck-timeout <时长>   第二轮的 timeoutMS；缺省是第一轮 --timeout（没给按 Stryker 缺省 5000 毫秒）的 4 倍且至少 60 秒
0.8.0 起退役的参数：--test、--engine、--lcov、--budget、--history、--no-tests-pattern、--load-ceiling（内建引擎及它的预算、覆盖门控、历史沿用、运行中自适应随之删除）；给了退出 2。
退出 0 正常；1 初跑不通过；2 用法错误、未提供 typescript、项目不是 vitest 或找不到 Stryker；129 收到 SIGHUP、130 被中断、143 被终止。`;
const SPEC = { repo: "value", project: "value", "build-command": "value", base: "value", target: "value", ts: "value", scope: "value", files: "value", json: "value", format: "value", "plan-only": "flag", timeout: "value", "no-recheck": "flag", "recheck-timeout": "value", "stryker-modules": "value", workers: "value", "other-heavy-tasks": "value", "low-memory-halve": "value", "no-nice": "flag" };
const RETIRED = { test: "测试命令由 Stryker 起 vitest，不再需要", engine: "内建引擎已删，只有 Stryker 一种", lcov: "覆盖由 Stryker 按用例记，不读 lcov", budget: "Stryker 没有整轮预算，超时的变异体改为单独复核", history: "增量由 Stryker 的 incremental 文件负责", "no-tests-pattern": "「没跑测试」是内建引擎跑整套命令时的问题，Stryker 按用例跑", "load-ceiling": "并行度启动时定下，运行中不调" };
const retired = process.argv.slice(2).map((a) => /^--([a-z-]+)/.exec(a)?.[1]).find((k) => k && k in RETIRED);
if (retired) { console.error(`--${retired} 0.8.0 起退役：${RETIRED[retired]}`); process.exit(2); }
const { opts, error } = parseArgs(process.argv.slice(2), SPEC);
if (error) { console.error(error); console.error(USAGE); process.exit(2); }
if (opts.help) { console.log(USAGE); process.exit(0); }

/** 装载失败一律退出 2，打印给定的话，没给就打印异常的话。 */
const load = (fn, message) => { try { return fn(); } catch (e) { console.error(message ?? e.message); process.exit(2); } };
/** 时长参数；给了但格式错退出 2。 */
const duration = (text, fallback) => { const ms = parseDuration(text, fallback); if (text && ms === null) { console.error(`时长格式错误：${text}`); process.exit(2); } return ms; };
/** 非负数参数；给了但不是数退出 2。 */
const number = (name, fallback) => { const text = opts[name]; if (text === undefined) return fallback; const n = Number(text); if (!Number.isFinite(n) || n < 0) { console.error(`数值格式错误：--${name} ${text}`); process.exit(2); } return n; };

/** 资源：容量、份额、并行度、优先级。 */
function planResources() {
  const cap = capacity();
  const otherHeavyTasks = number("other-heavy-tasks", 0);
  const lowMemoryHalveMb = number("low-memory-halve", 2048);
  const plan = plannedWorkers(cap, { otherHeavyTasks, lowMemoryHalveMb, workers: opts.workers === undefined ? null : number("workers", 1) });
  const nice = opts["no-nice"] || !niceAvailable() ? null : 10;
  return { capacity: cap, otherHeavyTasks, lowMemoryHalveMb, nice, ...plan };
}

/** 从参数装载全部输入：仓库、typescript、引擎、基线与运行参数。 */
function loadInputs() {
  const repo = resolve(opts.repo ?? process.cwd());
  const root = load(() => sh(repo, ["rev-parse", "--show-toplevel"]), `不是 Git 仓库：${repo}`);
  const project = load(() => resolveProject(root, opts.project ?? null));
  const ts = load(() => loadTypescript(opts.ts, root));
  const { modules, configFile, ...engine } = load(() => chooseEngine({ root: project.dir, repoRoot: root, modulesDir: opts["stryker-modules"] }));
  const { base, baseGiven } = load(() => resolveBase(root, opts.base, opts.target));
  return { root, project: { ...project, temp: tempDirFor(project) }, ts, engine, stryker: { modules, configFile }, base, baseGiven, head: sh(root, ["rev-parse", "HEAD"]), resources: planResources(), fingerprint: strykerFingerprint(project.dir, { ...engine, modules, configFile }), timeoutMs: duration(opts.timeout, null), recheckTimeoutMs: duration(opts["recheck-timeout"], null) };
}

/** 写 JSON 文件与打印。 */
function emit(result) {
  if (opts.json) writeFileSync(resolve(opts.json), JSON.stringify(result, null, 2) + "\n");
  if (opts.format === "json") console.log(JSON.stringify(result, null, 2));
  else console.log(formatMutation(result));
}

const inputs = loadInputs();
const pinned = parseScope(opts.files) ?? [];

/** 跑完之后的汇总：无效原因（初跑失败、未知状态）与沿用数。 */
function finish(result) {
  Object.assign(result, summarize(result.sites, { planOnly: result.planOnly, baselinePassed: result.baseline.passed !== false }));
  if (result.baseline.passed === false) result.summary.invalidReason = baselineFailure(result.baseline);
  if (result.unknown?.length) { result.summary.invalidReason = `报告里有映射表没有的状态：${result.unknown.join("、")}`; result.summary.valid = false; result.summary.score = null; }
  if (result.reused !== undefined) result.summary.carried = result.reused;
}

/** 正在跑的那轮：收到信号时先结束它、删自己建的容器，再按信号退出。 */
let current = null;
const interrupted = (code) => { const c = current; if (!c) process.exit(code); c.run.kill(); c.run.done.then(() => { c.cleanup(); process.exit(code); }); };
process.on("SIGHUP", () => interrupted(129));
process.on("SIGINT", () => interrupted(130));
process.on("SIGTERM", () => interrupted(143));

/** 起一轮 Stryker：配置、报告、日志都以 name 命名放在工作目录；返回运行结果、报告（没有为 null）与日志路径。 */
async function runOnce({ project, stryker, name, config }) {
  const dir = workDir(project.dir);
  mkdirSync(dir, { recursive: true });
  const reportPath = join(dir, `${name}.json`), configPath = join(dir, `stryker-${name}.json`), logPath = join(dir, `${name}.log`), tempDir = project.temp.path;
  const mark = join(dir, `${name}.build-failed`), command = opts["build-command"];
  for (const p of [reportPath, logPath, mark]) rmSync(p, { force: true });
  const hadTempDir = existsSync(tempDir);
  const cleanup = () => { if (!hadTempDir) rmSync(tempDir, { recursive: true, force: true }); };
  writeFileSync(configPath, JSON.stringify(strykerConfig({ ...config, configFile: stryker.configFile, reportPath, prefix: project.prefix, tempDirName: project.temp.name, build: Boolean(command) }), null, 2) + "\n");
  const run = runStryker({ root: project.dir, coreBin: stryker.modules.coreBin, configPath, nice: inputs.resources.nice, logPath, onProgress: (line) => console.error(line), env: buildEnv({ projectDir: project.dir, command, mark }) });
  current = { run, cleanup };
  const r = await run.done;
  current = null;
  cleanup();
  return { r, report: readReport(reportPath, project.prefix), logPath, buildFailed: existsSync(mark) };
}

/** 第一轮：全部范围，带增量。初跑失败（退出非零且无报告）记基线不通过，code 为 1；返回报告给复核用。 */
async function execute(result, { project, stryker, entries, ranges }) {
  const incremental = incrementalFor(workDir(project.dir), inputs.fingerprint);
  result.incremental = { file: incremental.file, force: incremental.force };
  const { r, report, logPath, buildFailed } = await runOnce({ project, stryker, name: "mutation", config: { entries: result.mutate, concurrency: inputs.resources.workers, timeoutMs: inputs.timeoutMs, incremental } });
  result.resources.timing = { totalSeconds: r.seconds };
  if (!report) { result.baseline = failedBaseline({ seconds: r.seconds, tail: r.tail, logPath, buildFailed }); return { code: 1, report }; }
  result.baseline = { passed: true, seconds: r.dryRunSeconds };
  rememberFingerprint(workDir(project.dir), inputs.fingerprint);
  result.reused = r.reused ?? 0;
  if (incremental.force && incremental.previous !== null) result.engine.notes.push("增量：指纹变了，整轮重跑");
  else if (result.reused === 0) result.engine.notes.push("增量：已开，本轮没有沿用");
  Object.assign(result, mapReport({ report, files: entries, ranges, pinned }));
  return { code: r.status === 0 ? 0 : 1, report };
}

/** 第二轮：第一轮超时的变异体所在的整行，一个进程、时限放宽、不进增量；结果并入位点。第二轮没有报告时全部记未复核，第一轮裁定不动，退出码不变。 */
async function recheckTimeouts(result, report, { project, stryker, entries, ranges }) {
  const mutate = timeoutEntries(report, entries, ranges, pinned);
  if (mutate.length === 0) return;
  const timeoutMs = inputs.recheckTimeoutMs ?? Math.max(4 * (inputs.timeoutMs ?? 5000), 60000);
  const { r, report: second, logPath } = await runOnce({ project, stryker, name: "recheck", config: { entries: mutate, concurrency: 1, timeoutMs, incremental: null } });
  result.resources.timing.recheckSeconds = r.seconds;
  const { unknown, ...counts } = mergeRecheck(result.sites, second, entries);
  result.recheck = { ...counts, seconds: r.seconds };
  result.unknown = [...new Set([...(result.unknown ?? []), ...unknown])];
  if (!second) result.engine.notes.push(`复核未完成：第二轮 Stryker 退出 ${r.status ?? r.signal} 且没有报告，${r.tail.trim().split("\n").pop()}（日志 ${logPath}），${result.recheck.total} 个超时位点保持第一轮裁定`);
}

const { root, project, ts, stryker } = inputs;
const changed = changedLines(root, inputs.base);
const mutable = [...new Set([...changed.keys(), ...pinned])].filter((p) => isMutable(root, p, parseScope(opts.scope))).sort();
const files = mutable.filter((p) => inProject(project, p));
const entries = fileEntries(root, ts, files);
// 范围：改动行所在单元自己的全部行；点名的文件整份。
const ranges = new Map(files.map((p) => [p, unitRanges(entries.get(p).units, changed.get(p) ?? [])]));
const result = { kind: "pqw-mutation", generatedAt: new Date().toISOString(), project: project.label, base: inputs.base, baseGiven: inputs.baseGiven, head: inputs.head, engine: { ...inputs.engine, notes: projectNotes({ outside: mutable.length - files.length, temp: project.temp, ignored: tempDirIgnored(project.dir, project.temp.name) }) }, fingerprint: inputs.fingerprint, pinned, planOnly: Boolean(opts["plan-only"]), baseline: { passed: null, seconds: null }, resources: inputs.resources, mutate: mutateEntries(ranges, pinned, files), sites: [], unmutated: [], summary: {}, survivors: [], recheck: null };
let code = 0;
if (!result.planOnly && result.mutate.length > 0) {
  const first = await execute(result, { project, stryker, entries, ranges });
  code = first.code;
  if (first.report && !opts["no-recheck"]) await recheckTimeouts(result, first.report, { project, stryker, entries, ranges });
}
finish(result);
emit(result);
process.exit(code);
