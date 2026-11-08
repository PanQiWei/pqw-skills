#!/usr/bin/env node
// 结构读数：只摘改动函数的圈复杂度、认知复杂度与 CRAP。模型见 ../metrics-model.md，逻辑在 lib/metrics.mjs，本文件只是命令面。
// 用法与每个参数的含义见 --help。退出 0 正常；1 失败；2 用法错误或未提供 typescript。
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, parseScope, resolveBase, parseLcov, sh } from "./lib/core.mjs";
import { loadTypescript } from "./lib/adapter-typescript.mjs";
import { collectMetrics, formatMetrics, parseThresholds } from "./lib/metrics.mjs";

const USAGE = `用法：metrics.mjs [选项]
只摘基线到工作树改动函数的圈复杂度、认知复杂度、覆盖率与 CRAP，并按线归档。

  --repo <目录>        仓库里任一目录，缺省当前目录
  --base <ref>         基线提交；缺省取与 --target 的合并点。给的 ref 不是 HEAD 的祖先时改用两者的合并点，抬头与 JSON 的 baseGiven 写明
  --target <分支>      缺省依次试 main、master
  --lcov <路径>        覆盖率文件；没有就 CRAP 记无覆盖
  --ts <目录>          typescript 包目录；缺省从仓库 node_modules 找
  --scope <前缀,前缀>  只看这些路径前缀
  --json <路径>        结果 JSON 写到这里；--format json 直接打印 JSON
  --cc <warn>,<alert>  圈复杂度两条线，缺省 10,12；严格大于才过线
  --crap <alert>       CRAP 的线，缺省 30；严格大于才过线

退出 0 正常；1 失败；2 用法错误或未提供 typescript。`;
const { opts, error } = parseArgs(process.argv.slice(2), { repo: "value", base: "value", target: "value", lcov: "value", ts: "value", json: "value", format: "value", scope: "value", cc: "value", crap: "value" });
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

const thresholds = load(() => parseThresholds(opts.cc, opts.crap));
const result = collectMetrics({ root, base, baseGiven, head, ts, report, scope: parseScope(opts.scope), thresholds });
if (opts.json) writeFileSync(resolve(opts.json), JSON.stringify(result, null, 2) + "\n");
if (opts.format === "json") console.log(JSON.stringify(result, null, 2));
else console.log(formatMetrics(result));
