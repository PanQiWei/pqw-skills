#!/usr/bin/env node
// 差分变异：只打改动行所在单元的位点，带时间预算，「没跑测试」自动复跑，四类裁定，还原有保证。模型见 ../metrics-model.md，逻辑在 lib/mutation.mjs，本文件是命令面与进程生命周期。
// 用法：mutation.mjs --test "<测试命令>" [--repo <目录>] [--base <ref>] [--target <分支>] [--lcov <路径>] [--ts <typescript 目录>]
//       [--json <输出路径>] [--format table|json] [--plan-only] [--budget 20m] [--timeout <时长>] [--workers N] [--no-tests-pattern <正则>] [--history <上次 JSON>] [--scope <前缀,前缀>]
// 退出 0 正常（预算用尽也是 0）；1 基线不通过或有文件还原失败；2 用法错误或未提供 typescript；130 被中断。
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cpus } from "node:os";
import { parseArgs, parseScope, resolveBase, parseLcov, sh } from "./lib/core.mjs";
import { loadTypescript } from "./lib/adapter-typescript.mjs";
import { parseDuration, collectSites, selectSites, createPatcher, createTestRunner, runSites, summarize, formatMutation } from "./lib/mutation.mjs";

const USAGE = "用法：mutation.mjs --test \"<测试命令>\" [--repo <目录>] [--base <ref>] [--target <分支>] [--lcov <路径>] [--ts <typescript 目录>] [--json <输出路径>] [--format table|json] [--plan-only] [--budget 20m] [--timeout <时长>] [--workers N] [--no-tests-pattern <正则>] [--history <上次 JSON>] [--scope <前缀,前缀>]";
const SPEC = { test: "value", repo: "value", base: "value", target: "value", lcov: "value", ts: "value", json: "value", format: "value", "plan-only": "flag", budget: "value", timeout: "value", workers: "value", "no-tests-pattern": "value", history: "value", scope: "value" };
const { opts, error } = parseArgs(process.argv.slice(2), SPEC);
if (error) { console.error(error); console.error(USAGE); process.exit(2); }
if (opts.help) { console.log(USAGE); process.exit(0); }
if (!opts.test) { console.error("未提供：测试命令（--test）"); console.error(USAGE); process.exit(2); }

/** 装载失败一律退出 2，打印给定的话，没给就打印异常的话。 */
const load = (fn, message) => { try { return fn(); } catch (e) { console.error(message ?? e.message); process.exit(2); } };
/** 时长参数；给了但格式错退出 2。 */
const duration = (text, fallback) => { const ms = parseDuration(text, fallback); if (text && ms === null) { console.error(`时长格式错误：${text}`); process.exit(2); } return ms; };

/** 从参数装载全部输入：仓库、typescript、基线、报告、历史与运行参数。 */
function loadInputs(opts) {
  const repo = resolve(opts.repo ?? process.cwd());
  const root = load(() => sh(repo, ["rev-parse", "--show-toplevel"]), `不是 Git 仓库：${repo}`);
  const ts = load(() => loadTypescript(opts.ts, root));
  const base = load(() => resolveBase(root, opts.base, opts.target));
  const workers = Number(opts.workers ?? Math.max(1, cpus().length - 1));
  // 从测试运行器里启动本工具时，NODE_TEST_CONTEXT 会让嵌套的 node --test 变成子报告进程，退出码失真，所以剥掉。
  const env = { ...process.env, PQW_TEST_WORKERS: String(workers), VITEST_MAX_WORKERS: process.env.VITEST_MAX_WORKERS ?? String(workers) };
  delete env.NODE_TEST_CONTEXT;
  return {
    root, ts, base, head: sh(root, ["rev-parse", "HEAD"]), env,
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
const result = { kind: "pqw-mutation", generatedAt: new Date().toISOString(), base: inputs.base, head: inputs.head, testCommand: opts.test, planOnly: Boolean(opts["plan-only"]), baseline: { passed: null, seconds: null }, budget: { limitMs: inputs.budgetMs, exceeded: false }, sites, summary: {}, survivors: [] };

const runner = createTestRunner(opts.test, inputs.root, inputs.env);
const patcher = createPatcher(inputs.root);
const interrupted = (code) => { runner.kill(); patcher.restore(); process.exit(code); };
process.on("SIGINT", () => interrupted(130));
process.on("SIGTERM", () => interrupted(143));

let restored = true;
if (!result.planOnly) {
  const run = await runSites({ sites, files, runner, patcher, budgetMs: inputs.budgetMs, timeoutMs: inputs.timeoutMs, noTests: inputs.noTests });
  result.baseline = run.baseline;
  result.budget = run.budget;
  restored = run.restored;
}
Object.assign(result, summarize(sites));
emit(result, opts);
process.exit(!restored || (!result.planOnly && !result.baseline.passed) ? 1 : 0);
