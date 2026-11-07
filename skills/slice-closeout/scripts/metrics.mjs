#!/usr/bin/env node
// 结构读数：只摘改动函数的圈复杂度、认知复杂度与 CRAP。模型见 ../metrics-model.md。
// 用法：metrics.mjs [--repo <目录>] [--base <ref>] [--target <分支>] [--lcov <路径>] [--ts <typescript 目录>] [--json <输出路径>] [--format table|json] [--scope <前缀,前缀>]
// 退出 0 正常；1 失败；2 用法错误或未提供 typescript。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs, resolveBase, changedLines, touches, parseLcov, coverageOf, crap, nestedUnits, round, sh } from "./lib/core.mjs";
import { loadTypescript, analyze, SOURCE_RE, DECLARATION_RE } from "./lib/adapter-typescript.mjs";

const USAGE = "用法：metrics.mjs [--repo <目录>] [--base <ref>] [--target <分支>] [--lcov <路径>] [--ts <typescript 目录>] [--json <输出路径>] [--format table|json] [--scope <前缀,前缀>]";
const { opts, error } = parseArgs(process.argv.slice(2), { repo: "value", base: "value", target: "value", lcov: "value", ts: "value", json: "value", format: "value", scope: "value" });
if (error) { console.error(error); console.error(USAGE); process.exit(2); }
if (opts.help) { console.log(USAGE); process.exit(0); }

const repo = resolve(opts.repo ?? process.cwd());
let root;
try { root = sh(repo, ["rev-parse", "--show-toplevel"]); } catch { console.error(`不是 Git 仓库：${repo}`); process.exit(2); }
let ts;
try { ts = loadTypescript(opts.ts, root); } catch (e) { console.error(e.message); process.exit(2); }
let base;
try { base = resolveBase(root, opts.base, opts.target); } catch (e) { console.error(e.message); process.exit(2); }
const head = sh(root, ["rev-parse", "HEAD"]);
const scope = opts.scope ? opts.scope.split(",").map((s) => s.trim()).filter(Boolean) : null;
const report = opts.lcov ? parseLcov(readFileSync(resolve(root, opts.lcov), "utf8")) : null;

const functions = [];
const uncovered = [];
for (const [path, ranges] of changedLines(root, base)) {
  if (scope && !scope.some((p) => path.startsWith(p))) continue;
  if (/(^|\/)node_modules\//.test(path) || !existsSync(join(root, path))) continue;
  if (!SOURCE_RE.test(path) || DECLARATION_RE.test(path)) { uncovered.push({ path, reason: "不是 TypeScript 或 JavaScript 源码" }); continue; }
  const text = readFileSync(join(root, path), "utf8");
  const { units } = analyze(ts, path, text);
  for (const unit of units) {
    const nested = nestedUnits(unit, units);
    const own = (l) => !nested.some((n) => l >= n.startLine && l <= n.endLine);
    const hit = ranges.filter(([a, b]) => a >= 1).some(([a, b]) => { for (let l = Math.max(a, unit.startLine); l <= Math.min(b, unit.endLine); l++) if (own(l)) return true; return false; });
    if (!hit) continue;
    const coverage = coverageOf(report, path, unit, nested);
    functions.push({ path, name: unit.name, namespace: unit.namespace, startLine: unit.startLine, endLine: unit.endLine, cyclomatic: unit.cyclomatic, cognitive: unit.cognitive, coverage: round(coverage, 4), crap: round(crap(unit.cyclomatic, coverage), 4), changedLines: ranges.filter(([a, b]) => touches([[a, b]], unit.startLine, unit.endLine)) });
  }
}
functions.sort((a, b) => (b.crap ?? -1) - (a.crap ?? -1) || b.cyclomatic - a.cyclomatic || a.path.localeCompare(b.path) || a.startLine - b.startLine);
const summary = { count: functions.length, maxCyclomatic: Math.max(0, ...functions.map((f) => f.cyclomatic)), maxCognitive: Math.max(0, ...functions.map((f) => f.cognitive)), maxCrap: functions.some((f) => f.crap !== null) ? Math.max(...functions.filter((f) => f.crap !== null).map((f) => f.crap)) : null, coverageProvided: report !== null };
const result = { kind: "pqw-metrics", generatedAt: new Date().toISOString(), base, head, functions, uncovered, summary };

if (opts.json) writeFileSync(resolve(opts.json), JSON.stringify(result, null, 2) + "\n");
if (opts.format === "json") { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
const fmt = (v, d) => (v === null ? "无覆盖" : d !== undefined ? v.toFixed(d) : String(v));
console.log(`结构读数：基线 ${base.slice(0, 12)} 到工作树；改动函数 ${functions.length} 个${report ? "" : "；没有 lcov，CRAP 写无覆盖"}`);
console.log("| 函数 | 文件 | 行 | 圈复杂度 | 认知复杂度 | 覆盖率 | CRAP |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
for (const f of functions) console.log(`| ${f.name} | ${f.path} | ${f.startLine}-${f.endLine} | ${f.cyclomatic} | ${f.cognitive} | ${f.coverage === null ? "无覆盖" : (f.coverage * 100).toFixed(0) + "%"} | ${fmt(f.crap, 2)} |`);
if (functions.length === 0) console.log("| | 没有改动的函数 | | | | | |");
if (uncovered.length) { console.log("\n未覆盖的改动文件："); for (const u of uncovered) console.log(`- ${u.path}：${u.reason}`); }
