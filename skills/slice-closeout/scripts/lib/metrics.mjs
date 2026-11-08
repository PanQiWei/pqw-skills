// 结构读数的逻辑：改动函数的圈复杂度、认知复杂度、覆盖率与 CRAP。模型见 ../../metrics-model.md。
// 不读 argv，不 exit；调用方传已装载的 typescript、lcov 报告与基线。
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { changedLines, inScope, touches, coverageOf, crap, nestedUnits, round, baseLabel, TEST_FILE_RE } from "./core.mjs";
import { analyze, SOURCE_RE, DECLARATION_RE } from "./adapter-typescript.mjs";

const NODE_MODULES_RE = /(^|\/)node_modules\//;

/** 改动行是否落在单元自己的行上（内层有名单元的行不算）。 */
export function touchesOwnLines(unit, nested, ranges) {
  const own = (l) => !nested.some((n) => l >= n.startLine && l <= n.endLine);
  return ranges.some(([a, b]) => {
    for (let l = Math.max(a, unit.startLine); l <= Math.min(b, unit.endLine); l++) if (own(l)) return true;
    return false;
  });
}

/** 缺省的线：函数级两条线，取 omne 的 repo-toolchain 与 crapper 的 --threshold。模型见「带位」。 */
export const DEFAULT_THRESHOLDS = { cyclomaticWarn: 10, cyclomaticAlert: 12, crapAlert: 30 };

/** 解析 `--cc <warn>,<alert>` 与 `--crap <alert>`；没给用缺省，格式错抛错。 */
export function parseThresholds(cc, crap) {
  const t = { ...DEFAULT_THRESHOLDS };
  if (cc !== undefined) {
    const m = /^(\d+),(\d+)$/.exec(cc);
    if (!m || Number(m[1]) > Number(m[2])) throw new Error(`--cc 要写成 <warn>,<alert> 且 warn 不大于 alert：${cc}`);
    t.cyclomaticWarn = Number(m[1]); t.cyclomaticAlert = Number(m[2]);
  }
  if (crap !== undefined) {
    if (!/^\d+(\.\d+)?$/.test(crap)) throw new Error(`--crap 要是一个数：${crap}`);
    t.crapAlert = Number(crap);
  }
  return t;
}

/** 带位：严格大于才过线。圈复杂度的线总是看；CRAP 的线只在算得出时看；都没过线而 CRAP 算不出记「无覆盖」。 */
export function bandOf(cyclomatic, crap, t) {
  if (cyclomatic > t.cyclomaticAlert || (crap !== null && crap > t.crapAlert)) return "alert";
  if (cyclomatic > t.cyclomaticWarn) return "warn";
  return crap === null ? "无覆盖" : "ok";
}

/** 一个单元的读数；改动不在它自己的行上时返回 null。 */
export function measureUnit(path, unit, units, ranges, report, thresholds = DEFAULT_THRESHOLDS) {
  const nested = nestedUnits(unit, units);
  if (!touchesOwnLines(unit, nested, ranges)) return null;
  const coverage = coverageOf(report, path, unit, nested);
  const crapValue = round(crap(unit.cyclomatic, coverage.value), 4);
  return {
    path, name: unit.name, namespace: unit.namespace, startLine: unit.startLine, endLine: unit.endLine,
    cyclomatic: unit.cyclomatic, cognitive: unit.cognitive,
    coverage: round(coverage.value, 4), coverageReason: coverage.reason, crap: crapValue, band: bandOf(unit.cyclomatic, crapValue, thresholds),
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

/** 不度量的文件及原因：非源码；声明文件；测试文件（匿名用例回调全并进 <module>，lcov 又不含它，读数没有意义）。 */
function skipReason(path) {
  if (!SOURCE_RE.test(path)) return "不是 TypeScript 或 JavaScript 源码";
  if (DECLARATION_RE.test(path)) return "声明文件不度量";
  if (TEST_FILE_RE.test(path)) return "测试文件不度量";
  return null;
}

/** 覆盖率列：有值写百分比；没给报告写「未提供」；报告里没有文件或范围内没有记录写「无数据」。 */
const coverageText = (f, provided) => {
  if (f.coverage !== null && f.coverage !== undefined) return (f.coverage * 100).toFixed(0) + "%";
  return (f.coverageReason ?? (provided ? "范围内没有记录" : "未提供报告")) === "未提供报告" ? "未提供" : "无数据";
};

/** 基线到工作树的改动函数读数。scope 是路径前缀数组或 null；report 是 parseLcov 的结果或 null。 */
/** 覆盖率报告的可信度警告：报告早于被度量的改动文件；改动函数全部零命中；报告里多个文件匹配同一路径。 */
export function coverageWarnings(root, functions, reportMtimeMs) {
  const warnings = [];
  const paths = [...new Set(functions.map((f) => f.path))];
  if (reportMtimeMs !== null) for (const p of paths) if (statSync(join(root, p)).mtimeMs > reportMtimeMs) warnings.push(`覆盖率报告早于改动文件 ${p}，行号可能错位`);
  if (functions.length && functions.every((f) => f.coverage === 0)) warnings.push("改动函数在报告里全部零命中，可能没跑到或报告过旧");
  for (const p of paths) if (functions.some((f) => f.path === p && f.coverageReason === "报告里多个文件匹配")) warnings.push(`报告里多个文件匹配 ${p}，没有取任何一个`);
  return warnings;
}

/** 基线到工作树的改动函数读数。scope 是路径前缀数组或 null；report 是 parseLcov 的结果或 null；reportMtimeMs 是报告文件的修改时刻（毫秒）或 null。 */
export function collectMetrics({ root, base, baseGiven = null, head, ts, report, scope, thresholds = DEFAULT_THRESHOLDS, reportMtimeMs = null }) {
  const functions = [];
  const uncovered = [];
  for (const [path, ranges] of changedLines(root, base)) {
    if (!inScope(path, scope) || NODE_MODULES_RE.test(path) || !existsSync(join(root, path))) continue;
    const skip = skipReason(path);
    if (skip) { uncovered.push({ path, reason: skip }); continue; }
    const { units } = analyze(ts, path, readFileSync(join(root, path), "utf8"));
    for (const unit of units) {
      const f = measureUnit(path, unit, units, ranges, report, thresholds);
      if (f) functions.push(f);
    }
  }
  functions.sort(byHotness);
  const warnings = report ? coverageWarnings(root, functions, reportMtimeMs) : [];
  return { kind: "pqw-metrics", generatedAt: new Date().toISOString(), base, baseGiven, head, thresholds, warnings, functions, uncovered, summary: summarize(functions, report) };
}

/** 人读的表格。 */
export function formatMetrics(result) {
  const { functions, uncovered, base, summary } = result;
  const lines = [
    `结构读数：基线 ${baseLabel(base, result.baseGiven)} 到工作树；改动函数 ${functions.length} 个${summary.coverageProvided ? "" : "；没有 lcov，CRAP 写无覆盖"}`,
    ...(result.warnings ?? []).map((w) => `警告：${w}`),
    "| 函数 | 文件 | 行 | 圈复杂度 | 认知复杂度 | 覆盖率 | CRAP | 带位 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const f of functions) lines.push(`| ${f.name} | ${f.path} | ${f.startLine}-${f.endLine} | ${f.cyclomatic} | ${f.cognitive} | ${coverageText(f, summary.coverageProvided)} | ${f.crap === null ? "无覆盖" : f.crap.toFixed(2)} | ${f.band ?? ""} |`);
  if (functions.length === 0) lines.push("| | 没有改动的函数 | | | | | | |");
  if (uncovered.length) {
    lines.push("", "未覆盖的改动文件：");
    for (const u of uncovered) lines.push(`- ${u.path}：${u.reason}`);
  }
  return lines.join("\n");
}
