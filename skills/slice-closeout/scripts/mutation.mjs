#!/usr/bin/env node
// 差分变异：只打改动行所在单元的位点，带时间预算，「没跑测试」自动复跑，四类裁定，还原有保证。模型见 ../metrics-model.md，逻辑在 lib/mutation.mjs，本文件是命令面与进程生命周期。
// 用法与每个参数的含义见 --help。
// 退出 0 正常（预算用尽也是 0）；1 基线不通过、有文件还原失败或文件在变异期间被改动；2 用法错误、未提供 typescript 或显式要的引擎不可用；129 收到 SIGHUP、130 被中断、143 被终止。
// 写入变异体前先把原文落到系统临时目录的还原日志，进程被杀也能在下次启动时还原。
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs, parseScope, resolveBase, parseLcov, sh, changedLines } from "./lib/core.mjs";
import { loadTypescript } from "./lib/adapter-typescript.mjs";
import { chooseEngine, ENGINES, mutateEntries, workDir, strykerConfig, runStryker, tempDirIgnored, readReport, mapReport, fileEntries } from "./lib/stryker.mjs";
import { parseDuration, collectSites, selectSites, createPatcher, restorePending, restoreLogPath, createTestRunner, runSites, summarize, formatMutation, capacity, plannedWorkers, runnerEnv, niceAvailable, createAdapter, fingerprintOf, isMutable } from "./lib/mutation.mjs";

const USAGE = `用法：mutation.mjs --test "<测试命令>" [选项]
只打基线到工作树改动单元的位点，每个位点跑一遍测试命令，裁定为杀死、存活、无覆盖、未跑四类。

  --test "<命令>"            内建引擎必填，Stryker 引擎下不用（vitest 由引擎起）。测试命令，在仓库根以 shell 运行；并行度通过环境变量 PQW_TEST_WORKERS 与 VITEST_MAX_WORKERS 交给它，例如 "vitest run" 或 "jest --maxWorkers=$PQW_TEST_WORKERS"
  --repo <目录>              仓库里任一目录，缺省当前目录
  --base <ref>               基线提交；缺省取与 --target 的合并点。给的 ref 不是 HEAD 的祖先（基线分支前进过）时改用两者的合并点，抬头与 JSON 的 baseGiven 写明
  --target <分支>            缺省依次试 main、master
  --lcov <路径>              覆盖率文件；给了就只打有执行记录的位点
  --ts <目录>                typescript 包目录（要 JS 实现，6.x 可用）；缺省从仓库 node_modules 找
  --scope <前缀,前缀>        只看这些路径前缀
  --files <路径,路径>        点名文件：这些文件的全部有名单元都出位点，不论改没改（判据、状态机所在的文件）；抬头写「（点名 N 个文件）」，位点带 pinned
  --json <路径>              结果 JSON 写到这里；--format json 直接打印 JSON
  --plan-only                只列位点，不跑
  --budget <时长>            时间预算，缺省 20m；用尽后剩余位点记 notRun(budget)
  --timeout <时长>           单次测试超时；缺省基线 10m，位点取基线用时的 5 倍且至少 10s
  --engine auto|stryker|builtin  执行引擎，缺省 auto：找得到 Stryker 与它的 vitest runner、且项目有 vitest 配置或声明了 vitest 时用 Stryker，否则用内建引擎；抬头之后一行写「引擎：…」，内建带原因。显式 stryker 而条件不满足退出 2 并说明装哪里
  --stryker-modules <目录>   装了 @stryker-mutator/core 与 vitest-runner 的 node_modules；解析顺序是项目根 node_modules、这里（也读环境变量 PQW_STRYKER_MODULES）、本脚本目录的 node_modules（npm ci --prefix 该目录）
  --history <上次 JSON>      上次结果；指纹（工具版本、测试命令、测试文件摘要）相同、单元摘要未变且上次杀死的位点沿用，抬头写「沿用 N」；指纹不同整份不沿用并写明
  --no-tests-pattern <正则>  判「没跑测试」的输出模式，命中就复跑一次；缺省带词界，「Tests 10 passed」不算。基线输出也命中时该模式判不出东西，抬头写明并按通过处理

资源。算式：份额 = 1 / (--other-heavy-tasks + 1)；上限 = max(1, floor(CPU 数 × 份额))，可用内存低于阈值时减半；并行度 = 缺省等于上限，显式 --workers 超过上限按上限。
  --other-heavy-tasks N      这台机器上除本工具外同时在跑的重型任务数，缺省 0；N=1 时本工具只拿一半 CPU
  --workers N                交给测试命令的并行度，缺省等于上限
  --low-memory-halve <MB>    可用内存低于这个数时上限减半，缺省 2048
  --load-ceiling <比例>      运行中 1 分钟负载 ÷ CPU 数超过它就降一档，回落到它减 0.2 以下再升回，缺省 0.8
  --no-nice                  不降低测试进程的优先级；缺省 nice 10，Windows 不降

还原保证：写入变异体前先把原文落到系统临时目录的还原日志（pqw-mutation/<仓库哈希>.json），还原后删；上次运行被杀留下日志，下次启动先还原并打印；留下的文件已被人改过就不覆盖，退出 1。写入前核文件仍是原文、还原前核文件仍是变异体，不是就不覆盖，打印「文件在变异期间被改动」退出 1。
退出 0 正常（预算用尽也是 0）；1 基线不通过、有文件还原失败或文件在变异期间被改动；2 用法错误、未提供 typescript 或显式要的引擎不可用；129 收到 SIGHUP、130 被中断、143 被终止。`;
const SPEC = { test: "value", repo: "value", base: "value", target: "value", lcov: "value", ts: "value", json: "value", format: "value", "plan-only": "flag", budget: "value", timeout: "value", workers: "value", "no-tests-pattern": "value", history: "value", scope: "value", engine: "value", "stryker-modules": "value", "other-heavy-tasks": "value", "low-memory-halve": "value", "load-ceiling": "value", "no-nice": "flag", files: "value" };
const { opts, error } = parseArgs(process.argv.slice(2), SPEC);
if (error) { console.error(error); console.error(USAGE); process.exit(2); }
if (opts.help) { console.log(USAGE); process.exit(0); }
const noTestCommand = () => { console.error("未提供：测试命令（--test）"); console.error(USAGE); process.exit(2); };
if (!opts.test && opts.engine === "builtin") noTestCommand();
if (opts.engine && !ENGINES.includes(opts.engine)) { console.error(`--engine 只接受 ${ENGINES.join("、")}：${opts.engine}`); console.error(USAGE); process.exit(2); }

/** 装载失败一律退出 2，打印给定的话，没给就打印异常的话。 */
const load = (fn, message) => { try { return fn(); } catch (e) { console.error(message ?? e.message); process.exit(2); } };
/** 时长参数；给了但格式错退出 2。 */
const duration = (text, fallback) => { const ms = parseDuration(text, fallback); if (text && ms === null) { console.error(`时长格式错误：${text}`); process.exit(2); } return ms; };
/** 非负数参数；给了但不是数退出 2。 */
const number = (name, fallback) => { const text = opts[name]; if (text === undefined) return fallback; const n = Number(text); if (!Number.isFinite(n) || n < 0) { console.error(`数值格式错误：--${name} ${text}`); process.exit(2); } return n; };

/** 资源：容量、份额、并行度、优先级。 */
function planResources(opts) {
  const cap = capacity();
  const otherHeavyTasks = number("other-heavy-tasks", 0);
  const lowMemoryHalveMb = number("low-memory-halve", 2048);
  const plan = plannedWorkers(cap, { otherHeavyTasks, lowMemoryHalveMb, workers: opts.workers === undefined ? null : number("workers", 1) });
  const nice = opts["no-nice"] || !niceAvailable() ? null : 10;
  return { capacity: cap, otherHeavyTasks, lowMemoryHalveMb, loadCeiling: number("load-ceiling", 0.8), nice, ...plan };
}

/** 从参数装载全部输入：仓库、typescript、基线、报告、历史与运行参数。 */
function loadInputs(opts) {
  const repo = resolve(opts.repo ?? process.cwd());
  const root = load(() => sh(repo, ["rev-parse", "--show-toplevel"]), `不是 Git 仓库：${repo}`);
  const ts = load(() => loadTypescript(opts.ts, root));
  const { modules, configFile, ...engine } = load(() => chooseEngine({ engine: opts.engine, root, modulesDir: opts["stryker-modules"] }));
  const { base, baseGiven } = load(() => resolveBase(root, opts.base, opts.target));
  const resources = planResources(opts);
  return {
    root, ts, engine, stryker: { modules, configFile }, base, baseGiven, head: sh(root, ["rev-parse", "HEAD"]), resources, env: runnerEnv(process.env, resources.workers), fingerprint: fingerprintOf(root, opts.test),
    report: opts.lcov ? parseLcov(readFileSync(resolve(root, opts.lcov), "utf8")) : null,
    history: opts.history ? JSON.parse(readFileSync(resolve(opts.history), "utf8")) : null,
    budgetMs: duration(opts.budget, 20 * 60000),
    timeoutMs: duration(opts.timeout, null),
    noTests: new RegExp(opts["no-tests-pattern"] ?? "No test files found|\\bno tests? (ran|found)\\b|(^|\\D)0 (tests?|passed)\\b|\\bran 0 tests\\b", "i"),
  };
}

/** 写 JSON 文件与打印。 */
function emit(result, opts) {
  if (opts.json) writeFileSync(resolve(opts.json), JSON.stringify(result, null, 2) + "\n");
  if (opts.format === "json") console.log(JSON.stringify(result, null, 2));
  else console.log(formatMutation(result));
}

/** 跑全部位点并把结果并进 result；文件在变异期间被改动就打印并退出 1。返回还原是否成功。 */
async function execute(result, { sites, files, runner, patcher, inputs }) {
  const adapter = createAdapter({ planned: inputs.resources.workers, ceiling: inputs.resources.loadCeiling });
  let run;
  try {
    run = await runSites({ sites, files, runner, patcher, budgetMs: inputs.budgetMs, timeoutMs: inputs.timeoutMs, noTests: inputs.noTests, adapter });
  } catch (e) {
    if (e.code !== "tampered") throw e;
    console.error(e.message);
    process.exit(1);
  }
  result.baseline = run.baseline;
  result.budget = run.budget;
  result.resources.adaptation = run.adaptation;
  result.resources.timing = run.timing;
  return run.restored;
}

/** 上次运行留下的变异体先还原再开始；留下的文件已被人改过就不覆盖，退出 1。 */
function restoreLeftover(root) {
  try {
    const pending = restorePending(root);
    if (pending) console.error(`上次运行留下的变异体已还原：${pending}`);
  } catch (e) {
    if (e.code !== "tampered") throw e;
    console.error(`${e.message}；上次运行留下的变异体没有还原，请手工核对后删除还原日志 ${restoreLogPath(root)}`);
    process.exit(1);
  }
}

const inputs = loadInputs(opts);
if (!opts.test && inputs.engine.name !== "stryker") noTestCommand();
const pinned = parseScope(opts.files) ?? [];
const newResult = (sites, unmutated, history) => ({ kind: "pqw-mutation", generatedAt: new Date().toISOString(), base: inputs.base, baseGiven: inputs.baseGiven, head: inputs.head, engine: inputs.engine, testCommand: opts.test ?? null, fingerprint: inputs.fingerprint, history, pinned, planOnly: Boolean(opts["plan-only"]), baseline: { passed: null, seconds: null }, budget: { limitMs: inputs.budgetMs, exceeded: false }, resources: inputs.resources, sites, unmutated, summary: {}, survivors: [] });

/** 内建引擎：收位点、写入变异体、每个位点跑一遍测试。 */
async function runBuiltin() {
  restoreLeftover(inputs.root);
  const { files, sites, unmutated } = collectSites({ root: inputs.root, base: inputs.base, ts: inputs.ts, scope: parseScope(opts.scope), pinned });
  const history = selectSites(sites, inputs.report, inputs.history, inputs.fingerprint);
  const result = newResult(sites, unmutated, history);
  const runner = createTestRunner(opts.test, inputs.root, inputs.env, { nice: inputs.resources.nice });
  const patcher = createPatcher(inputs.root);
  const interrupted = (code) => { runner.kill(); try { patcher.restore(); } catch (e) { console.error(e.message); } process.exit(code); };
  process.on("SIGHUP", () => interrupted(129));
  process.on("SIGINT", () => interrupted(130));
  process.on("SIGTERM", () => interrupted(143));
  const restored = result.planOnly ? true : await execute(result, { sites, files, runner, patcher, inputs });
  Object.assign(result, summarize(sites, { planOnly: result.planOnly, baselinePassed: result.baseline.passed !== false }));
  emit(result, opts);
  return !restored || (!result.planOnly && !result.baseline.passed) ? 1 : 0;
}

/** Stryker 引擎：范围变 mutate 条目与配置，在项目根起 Stryker，读报告映射回位点。不碰项目文件，只写 .stryker-tmp 与系统临时目录。 */
async function runStrykerEngine() {
  const { root, ts, stryker } = inputs;
  const changed = changedLines(root, inputs.base);
  const scope = parseScope(opts.scope);
  const files = [...new Set([...changed.keys(), ...pinned])].filter((p) => isMutable(root, p, scope)).sort();
  const result = newResult([], [], { given: false, used: false, reason: null });
  result.mutate = mutateEntries(changed, pinned, files);
  result.budget = { limitMs: null, exceeded: false };
  result.engine.notes = [];
  if (opts.budget) result.engine.notes.push("--budget 对 Stryker 引擎不适用：引擎没有整轮预算");
  if (!tempDirIgnored(root)) result.engine.notes.push("`.stryker-tmp` 没被项目忽略：跑完会删，被杀时会留下，建议加进 .gitignore");
  let code = 0;
  if (!result.planOnly && result.mutate.length > 0) code = await executeStryker(result, { root, ts, stryker, changed, files });
  Object.assign(result, summarize(result.sites, { planOnly: result.planOnly, baselinePassed: result.baseline.passed !== false }));
  if (result.baseline.passed === false) result.summary.invalidReason = "Stryker 初跑失败";
  if (result.reused !== undefined) result.summary.carried = result.reused;
  emit(result, opts);
  return code;
}

/** 起一轮 Stryker 并把报告并进 result。初跑失败（退出非零且无报告）记基线不通过，返回 1。 */
async function executeStryker(result, { root, ts, stryker, changed, files }) {
  const dir = workDir(root);
  mkdirSync(dir, { recursive: true });
  const reportPath = join(dir, "mutation.json"), configPath = join(dir, "stryker.json"), logPath = join(dir, "stryker.log"), tempDir = join(root, ".stryker-tmp");
  rmSync(reportPath, { force: true }); rmSync(logPath, { force: true });
  const hadTempDir = existsSync(tempDir);
  writeFileSync(configPath, JSON.stringify(strykerConfig({ entries: result.mutate, configFile: stryker.configFile, concurrency: inputs.resources.workers, reportPath, timeoutMs: inputs.timeoutMs }), null, 2) + "\n");
  const run = runStryker({ root, coreBin: stryker.modules.coreBin, configPath, nice: inputs.resources.nice, logPath, onProgress: (line) => console.error(line) });
  const interrupted = (code) => { run.kill(); run.done.then(() => { if (!hadTempDir) rmSync(tempDir, { recursive: true, force: true }); process.exit(code); }); };
  process.on("SIGHUP", () => interrupted(129));
  process.on("SIGINT", () => interrupted(130));
  process.on("SIGTERM", () => interrupted(143));
  const r = await run.done;
  if (!hadTempDir) rmSync(tempDir, { recursive: true, force: true });
  result.resources.timing = { testSeconds: null, totalSeconds: r.seconds, overheadRatio: null };
  const report = readReport(reportPath);
  if (!report) { result.baseline = { passed: false, seconds: r.seconds, tail: `${r.tail}\n（完整日志 ${logPath}）` }; return 1; }
  result.baseline = { passed: true, seconds: r.seconds };
  result.reused = r.reused ?? 0;
  Object.assign(result, mapReport({ report, files: fileEntries(root, ts, files), ranges: changed, pinned }));
  return r.status === 0 ? 0 : 1;
}

process.exit(await (inputs.engine.name === "stryker" ? runStrykerEngine() : runBuiltin()));
