// 结构读数的逻辑：改动函数的圈复杂度、认知复杂度、覆盖率与 CRAP。模型见 ../../metrics-model.md。
// 不读 argv，不 exit；调用方传已装载的 typescript、lcov 报告与基线。
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { changedLines, inScope, touches, coverageOf, crap, nestedUnits, round } from "./core.mjs";
import { analyze, SOURCE_RE, DECLARATION_RE } from "./adapter-typescript.mjs";

const NODE_MODULES_RE = /(^|\/)node_modules\//;

/** 改动行是否落在单元自己的行上（内层有名单元的行不算）。 */
export function touchesOwnLines(unit, nested, ranges) {
  const own = (l) => !nested.some((n) => l >= n.startLine && l <= n.endLine);
  return ranges.some(([a, b]) => {
    if (a < 1) return false;
    for (let l = Math.max(a, unit.startLine); l <= Math.min(b, unit.endLine); l++) if (own(l)) return true;
    return false;
  });
}

/** 一个单元的读数；改动不在它自己的行上时返回 null。 */
export function measureUnit(path, unit, units, ranges, report) {
  const nested = nestedUnits(unit, units);
  if (!touchesOwnLines(unit, nested, ranges)) return null;
  const coverage = coverageOf(report, path, unit, nested);
  return {
    path, name: unit.name, namespace: unit.namespace, startLine: unit.startLine, endLine: unit.endLine,
    cyclomatic: unit.cyclomatic, cognitive: unit.cognitive,
    coverage: round(coverage, 4), crap: round(crap(unit.cyclomatic, coverage), 4),
    changedLines: ranges.filter(([a, b]) => touches([[a, b]], unit.startLine, unit.endLine)),
  };
}

/** 排序：CRAP 高在前（无覆盖算最低），再圈复杂度，再文件与行。 */
export const byHotness = (a, b) => (b.crap ?? -1) - (a.crap ?? -1) || b.cyclomatic - a.cyclomatic || a.path.localeCompare(b.path) || a.startLine - b.startLine;

export function summarize(functions, report) {
  const withCrap = functions.filter((f) => f.crap !== null);
  return {
    count: functions.length,
    maxCyclomatic: Math.max(0, ...functions.map((f) => f.cyclomatic)),
    maxCognitive: Math.max(0, ...functions.map((f) => f.cognitive)),
    maxCrap: withCrap.length ? Math.max(...withCrap.map((f) => f.crap)) : null,
    coverageProvided: report !== null,
  };
}

/** 基线到工作树的改动函数读数。scope 是路径前缀数组或 null；report 是 parseLcov 的结果或 null。 */
export function collectMetrics({ root, base, head, ts, report, scope }) {
  const functions = [];
  const uncovered = [];
  for (const [path, ranges] of changedLines(root, base)) {
    if (!inScope(path, scope) || NODE_MODULES_RE.test(path) || !existsSync(join(root, path))) continue;
    if (!SOURCE_RE.test(path) || DECLARATION_RE.test(path)) { uncovered.push({ path, reason: "不是 TypeScript 或 JavaScript 源码" }); continue; }
    const { units } = analyze(ts, path, readFileSync(join(root, path), "utf8"));
    for (const unit of units) {
      const f = measureUnit(path, unit, units, ranges, report);
      if (f) functions.push(f);
    }
  }
  functions.sort(byHotness);
  return { kind: "pqw-metrics", generatedAt: new Date().toISOString(), base, head, functions, uncovered, summary: summarize(functions, report) };
}

/** 人读的表格。 */
export function formatMetrics(result) {
  const { functions, uncovered, base, summary } = result;
  const pct = (c) => (c === null ? "无覆盖" : (c * 100).toFixed(0) + "%");
  const lines = [
    `结构读数：基线 ${base.slice(0, 12)} 到工作树；改动函数 ${functions.length} 个${summary.coverageProvided ? "" : "；没有 lcov，CRAP 写无覆盖"}`,
    "| 函数 | 文件 | 行 | 圈复杂度 | 认知复杂度 | 覆盖率 | CRAP |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const f of functions) lines.push(`| ${f.name} | ${f.path} | ${f.startLine}-${f.endLine} | ${f.cyclomatic} | ${f.cognitive} | ${pct(f.coverage)} | ${f.crap === null ? "无覆盖" : f.crap.toFixed(2)} |`);
  if (functions.length === 0) lines.push("| | 没有改动的函数 | | | | | |");
  if (uncovered.length) {
    lines.push("", "未覆盖的改动文件：");
    for (const u of uncovered) lines.push(`- ${u.path}：${u.reason}`);
  }
  return lines.join("\n");
}
