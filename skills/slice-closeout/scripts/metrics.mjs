#!/usr/bin/env node
// 结构读数：只摘改动函数的圈复杂度、认知复杂度与 CRAP。模型见 ../metrics-model.md，逻辑在 lib/metrics.mjs，本文件只是命令面。
// 用法：metrics.mjs [--repo <目录>] [--base <ref>] [--target <分支>] [--lcov <路径>] [--ts <typescript 目录>] [--json <输出路径>] [--format table|json] [--scope <前缀,前缀>]
// 退出 0 正常；1 失败；2 用法错误或未提供 typescript。
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, parseScope, resolveBase, parseLcov, sh } from "./lib/core.mjs";
import { loadTypescript } from "./lib/adapter-typescript.mjs";
import { collectMetrics, formatMetrics } from "./lib/metrics.mjs";

const USAGE = "用法：metrics.mjs [--repo <目录>] [--base <ref>] [--target <分支>] [--lcov <路径>] [--ts <typescript 目录>] [--json <输出路径>] [--format table|json] [--scope <前缀,前缀>]";
const { opts, error } = parseArgs(process.argv.slice(2), { repo: "value", base: "value", target: "value", lcov: "value", ts: "value", json: "value", format: "value", scope: "value" });
if (error) { console.error(error); console.error(USAGE); process.exit(2); }
if (opts.help) { console.log(USAGE); process.exit(0); }

/** 装载失败一律退出 2，打印给定的话，没给就打印异常的话。 */
const load = (fn, message) => { try { return fn(); } catch (e) { console.error(message ?? e.message); process.exit(2); } };
const repo = resolve(opts.repo ?? process.cwd());
const root = load(() => sh(repo, ["rev-parse", "--show-toplevel"]), `不是 Git 仓库：${repo}`);
const ts = load(() => loadTypescript(opts.ts, root));
const { base, baseGiven } = load(() => resolveBase(root, opts.base, opts.target));
const head = sh(root, ["rev-parse", "HEAD"]);
const report = opts.lcov ? parseLcov(readFileSync(resolve(root, opts.lcov), "utf8")) : null;

const result = collectMetrics({ root, base, baseGiven, head, ts, report, scope: parseScope(opts.scope) });
if (opts.json) writeFileSync(resolve(opts.json), JSON.stringify(result, null, 2) + "\n");
if (opts.format === "json") console.log(JSON.stringify(result, null, 2));
else console.log(formatMetrics(result));
