#!/usr/bin/env node
// 差分变异：只打改动行所在单元的位点，带时间预算，「没跑测试」自动复跑，四类裁定，还原有保证。模型见 ../metrics-model.md，逻辑在 lib/mutation.mjs，本文件是命令面与进程生命周期。
// 用法与每个参数的含义见 --help。
// 退出 0 正常（预算用尽也是 0）；1 基线不通过或有文件还原失败；2 用法错误或未提供 typescript；130 被中断。
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, parseScope, resolveBase, parseLcov, sh } from "./lib/core.mjs";
import { loadTypescript } from "./lib/adapter-typescript.mjs";
import { parseDuration, collectSites, selectSites, createPatcher, createTestRunner, runSites, summarize, formatMutation, capacity, plannedWorkers, runnerEnv, niceAvailable, createAdapter } from "./lib/mutation.mjs";

const USAGE = `用法：mutation.mjs --test "<测试命令>" [选项]
只打基线到工作树改动单元的位点，每个位点跑一遍测试命令，裁定为杀死、存活、无覆盖、未跑四类。

  --test "<命令>"            必填。测试命令，在仓库根以 shell 运行；并行度通过环境变量 PQW_TEST_WORKERS 与 VITEST_MAX_WORKERS 交给它，例如 "vitest run" 或 "jest --maxWorkers=$PQW_TEST_WORKERS"
  --repo <目录>              仓库里任一目录，缺省当前目录
  --base <ref>               基线提交；缺省取与 --target 的合并点。给的 ref 不是 HEAD 的祖先（基线分支前进过）时改用两者的合并点，抬头与 JSON 的 baseGiven 写明
  --target <分支>            缺省依次试 main、master
  --lcov <路径>              覆盖率文件；给了就只打有执行记录的位点
  --ts <目录>                typescript 包目录（要 JS 实现，6.x 可用）；缺省从仓库 node_modules 找
  --scope <前缀,前缀>        只看这些路径前缀
  --json <路径>              结果 JSON 写到这里；--format json 直接打印 JSON
  --plan-only                只列位点，不跑
  --budget <时长>            时间预算，缺省 20m；用尽后剩余位点记 notRun(budget)
  --timeout <时长>           单次测试超时；缺省基线 10m，位点取基线用时的 5 倍且至少 10s
  --history <上次 JSON>      上次结果；单元摘要未变且上次杀死的位点沿用
  --no-tests-pattern <正则>  判「没跑测试」的输出模式，命中就复跑一次

资源。算式：份额 = 1 / (--other-heavy-tasks + 1)；上限 = max(1, floor(CPU 数 × 份额))，可用内存低于阈值时减半；并行度 = 缺省等于上限，显式 --workers 超过上限按上限。
  --other-heavy-tasks N      这台机器上除本工具外同时在跑的重型任务数，缺省 0；N=1 时本工具只拿一半 CPU
  --workers N                交给测试命令的并行度，缺省等于上限
  --low-memory-halve <MB>    可用内存低于这个数时上限减半，缺省 2048
  --load-ceiling <比例>      运行中 1 分钟负载 ÷ CPU 数超过它就降一档，回落到它减 0.2 以下再升回，缺省 0.8
  --no-nice                  不降低测试进程的优先级；缺省 nice 10，Windows 不降

退出 0 正常（预算用尽也是 0）；1 基线不通过或有文件还原失败；2 用法错误或未提供 typescript；130 被中断。`;
const SPEC = { test: "value", repo: "value", base: "value", target: "value", lcov: "value", ts: "value", json: "value", format: "value", "plan-only": "flag", budget: "value", timeout: "value", workers: "value", "no-tests-pattern": "value", history: "value", scope: "value", "other-heavy-tasks": "value", "low-memory-halve": "value", "load-ceiling": "value", "no-nice": "flag" };
const { opts, error } = parseArgs(process.argv.slice(2), SPEC);
if (error) { console.error(error); console.error(USAGE); process.exit(2); }
if (opts.help) { console.log(USAGE); process.exit(0); }
if (!opts.test) { console.error("未提供：测试命令（--test）"); console.error(USAGE); process.exit(2); }

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
  const { base, baseGiven } = load(() => resolveBase(root, opts.base, opts.target));
  const resources = planResources(opts);
  return {
    root, ts, base, baseGiven, head: sh(root, ["rev-parse", "HEAD"]), resources, env: runnerEnv(process.env, resources.workers),
    report: opts.lcov ? parseLcov(readFileSync(resolve(root, opts.lcov), "utf8")) : null,
    history: opts.history ? JSON.parse(readFileSync(resolve(opts.history), "utf8")) : null,
    budgetMs: duration(opts.budget, 20 * 60000),
    timeoutMs: duration(opts.timeout, null),
    noTests: new RegExp(opts["no-tests-pattern"] ?? "No test files found|no tests? (ran|found)|0 (tests?|passed)|ran 0 tests", "i"),
  };
}

/** 写 JSON 文件与打印。 */
function emit(result, opts) {
  if (opts.json) writeFileSync(resolve(opts.json), JSON.stringify(result, null, 2) + "\n");
  if (opts.format === "json") console.log(JSON.stringify(result, null, 2));
  else console.log(formatMutation(result));
}

const inputs = loadInputs(opts);
const { files, sites } = collectSites({ root: inputs.root, base: inputs.base, ts: inputs.ts, scope: parseScope(opts.scope) });
selectSites(sites, inputs.report, inputs.history);
const result = { kind: "pqw-mutation", generatedAt: new Date().toISOString(), base: inputs.base, baseGiven: inputs.baseGiven, head: inputs.head, testCommand: opts.test, planOnly: Boolean(opts["plan-only"]), baseline: { passed: null, seconds: null }, budget: { limitMs: inputs.budgetMs, exceeded: false }, resources: inputs.resources, sites, summary: {}, survivors: [] };

const runner = createTestRunner(opts.test, inputs.root, inputs.env, { nice: inputs.resources.nice });
const patcher = createPatcher(inputs.root);
const interrupted = (code) => { runner.kill(); patcher.restore(); process.exit(code); };
process.on("SIGINT", () => interrupted(130));
process.on("SIGTERM", () => interrupted(143));

let restored = true;
if (!result.planOnly) {
  const adapter = createAdapter({ planned: inputs.resources.workers, ceiling: inputs.resources.loadCeiling });
  const run = await runSites({ sites, files, runner, patcher, budgetMs: inputs.budgetMs, timeoutMs: inputs.timeoutMs, noTests: inputs.noTests, adapter });
  result.baseline = run.baseline;
  result.budget = run.budget;
  result.resources.adaptation = run.adaptation;
  result.resources.timing = run.timing;
  restored = run.restored;
}
Object.assign(result, summarize(sites));
emit(result, opts);
process.exit(!restored || (!result.planOnly && !result.baseline.passed) ? 1 : 0);
