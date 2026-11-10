// 差分变异的位点模型与读数：资源算式、能打的文件、汇总与格式化。模型见 ../../metrics-model.md。
// 执行（范围变配置、起 Stryker、读报告、映射、增量、复核）在 ./stryker.mjs；进程生命周期归命令面。不读 argv，不 exit。
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { cpus, freemem, loadavg } from "node:os";
import { inScope, score, baseLabel, TEST_FILE_RE } from "./core.mjs";
import { SOURCE_RE, DECLARATION_RE } from "./adapter-typescript.mjs";

// ---- 资源：容量自测、份额、并行度。模型见 ../../metrics-model.md「资源」。

/** 机器容量：逻辑 CPU 数、可用内存（MB）、1 分钟负载。 */
export const capacity = () => ({ cpus: Math.max(1, cpus().length), freeMemMb: Math.round(freemem() / 1048576), load1: Math.round(loadavg()[0] * 100) / 100 });

/**
 * 并行度：份额 = 1 / (同机另有的重型任务数 + 1)；上限 = max(1, floor(cpus × 份额))；
 * 可用内存低于阈值时上限减半；显式给的 workers 不能超过上限。
 */
export function plannedWorkers(cap, { otherHeavyTasks = 0, lowMemoryHalveMb = 2048, workers = null } = {}) {
  const share = 1 / (otherHeavyTasks + 1);
  let ceiling = Math.max(1, Math.floor(cap.cpus * share));
  const halved = cap.freeMemMb < lowMemoryHalveMb;
  if (halved) ceiling = Math.max(1, Math.floor(ceiling / 2));
  const capped = workers !== null && workers > ceiling;
  const effective = workers === null ? ceiling : Math.max(1, Math.min(workers, ceiling));
  return { share, ceiling, workers: effective, requested: workers, capped, halved };
}

/** 能不能降优先级：Windows 不设；其他平台探一次 `nice -n 0 true`，没有 nice 命令或设不了就不设，调用方据此写明。 */
export const niceAvailable = () => process.platform !== "win32" && spawnSync("nice", ["-n", "0", "true"], { stdio: "ignore" }).status === 0;

// ---- 位点模型。

export { TEST_FILE_RE };
const NODE_MODULES_RE = /(^|\/)node_modules\//;
const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 };

/** 时长字符串转毫秒：`90s`、`20m`、`1.5h`，无单位按秒。没给返回 fallback；格式错返回 null。 */
export function parseDuration(text, fallback) {
  if (!text) return fallback;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(text);
  return m ? Number(m[1]) * UNITS[m[2] ?? "s"] : null;
}

/** 能打位点的文件：在范围内、是源码、不是声明文件、不是测试、不在 node_modules、还在工作树里。 */
export const isMutable = (root, path, scope) => inScope(path, scope) && SOURCE_RE.test(path) && !DECLARATION_RE.test(path) && !TEST_FILE_RE.test(path) && !NODE_MODULES_RE.test(path) && existsSync(join(root, path));

/** 存活位点的事实一句：只说发生了什么，怎么处置归读的人。字段名沿用 suggestion（I-1）。 */
const suggestion = (s) => (s.mutant === "" ? `删去 ${s.original} 后测试仍过` : `${s.original} 换成 ${s.mutant} 后测试仍过`);

/** 超过复核上限、没有复核的超时位点的原因；运行时报错的位点的原因（Stryker 的 RuntimeError）。 */
export const UNRECHECKED = "超时未复核";
const RUNTIME_ERROR = "runtime error";

/**
 * 测量无效的原因：基线不通过；有超时未复核的位点；有运行时报错的位点；或一个位点都没有执行（杀死加存活为 0），
 * 按情形分没有位点、全部无覆盖、没有执行。有效返回 null。
 */
function invalidReasonOf(summary, baselinePassed, sites) {
  if (!baselinePassed) return "基线不通过";
  const unrechecked = sites.filter((s) => s.reason === UNRECHECKED).length;
  if (unrechecked) return `${UNRECHECKED} ${unrechecked} 个`;
  const runtime = sites.filter((s) => s.reason === RUNTIME_ERROR).length;
  if (runtime) return `运行时报错 ${runtime} 个位点`;
  if (summary.killed + summary.survived > 0) return null;
  if (summary.total === 0) return "没有位点";
  return summary.uncovered === summary.total ? "全部位点无覆盖" : "没有执行任何位点";
}

/**
 * 汇总、存活清单与运行时报错的位点。timedOut 是杀死里因超时的位点数，单列是因为超时可能是机器慢而不是测试强。
 * valid 为 false 时 score 为 null，抬头不出计数：没有执行过的测量不能写成「杀死 0、存活 0」。只列时 valid 为 null。
 */
export function summarize(sites, { planOnly = false, baselinePassed = true } = {}) {
  const count = (v) => sites.filter((s) => s.verdict === v).length;
  const byReason = (r) => sites.filter((s) => s.reason === r).length;
  const summary = { total: sites.length, killed: count("killed"), survived: count("survived"), uncovered: count("uncovered"), notRun: count("notRun"), planned: count("planned"), timedOut: byReason("timeout"), carried: byReason("carried"), score: score(sites), valid: null, invalidReason: null };
  if (!planOnly) {
    summary.invalidReason = invalidReasonOf(summary, baselinePassed, sites);
    summary.valid = summary.invalidReason === null;
    if (!summary.valid) summary.score = null;
  }
  const fact = (s) => ({ file: s.file, unit: s.unit, line: s.line, original: s.original, mutant: s.mutant });
  const survivors = sites.filter((s) => s.verdict === "survived").map((s) => ({ ...fact(s), category: s.category, suggestion: suggestion(s) }));
  return { summary, survivors, runtimeErrors: sites.filter((s) => s.reason === RUNTIME_ERROR).map(fact) };
}

// ---- 人读的输出。

const VERDICT_TEXT = { planned: "待跑", killed: "杀死", survived: "存活", uncovered: "无覆盖", notRun: "未跑" };

const siteRow = (s) => `| ${s.file} | ${s.unit} | ${s.line} | \`${s.original}\` | \`${s.mutant === "" ? "（删去）" : s.mutant}\` | ${s.category} | ${VERDICT_TEXT[s.verdict]}${s.reason ? `（${s.reason}）` : ""} |`;

/** 复核那一段：有复核才写。 */
const recheckText = (r) => (r ? `；复核 ${r.total}（超时转杀死 ${r.killed}、存活 ${r.survived}、仍超时 ${r.timedOut}${r.notRun ? `、未复核 ${r.notRun}` : ""}）` : "");

/** 抬头的计数部分：只列、四类计数与分数、其中超时、沿用、复核。 */
function tallyText(result) {
  const sm = result.summary;
  if (result.planOnly) return "（只列）";
  if (sm.valid === false) return `：测量无效（${sm.invalidReason}）`;
  const score = sm.score === null ? "无" : (sm.score * 100).toFixed(0) + "%";
  const timedOut = sm.timedOut ? `（其中超时 ${sm.timedOut}）` : "";
  const carried = sm.carried ? `；沿用 ${sm.carried}` : "";
  return `：杀死 ${sm.killed}${timedOut}、存活 ${sm.survived}、无覆盖 ${sm.uncovered}、未跑 ${sm.notRun}；分数 ${score}${carried}${recheckText(result.recheck)}`;
}

/** 抬头之后关于基线的说明：初跑不通过的尾巴；沙箱预检没跑通时再列没跑通的测试文件。 */
function baselineNotes(result) {
  if (result.planOnly || result.baseline.passed !== false) return [];
  const files = result.baseline.failedFiles;
  return [`基线不通过：\n${result.baseline.tail}`, ...(files ? ["没跑通的测试文件：", ...(files.length ? files.map((f) => `- ${f}`) : ["- （报告里没有定位到文件，见上面的日志）"])] : [])];
}

/** 引擎那一行与它的说明；结果里没有 engine（直接调库）时不出。 */
function engineLine(result) {
  const e = result.engine;
  return e ? [`引擎：Stryker ${e.version}（${e.runner}）`, ...(e.notes ?? [])] : [];
}

/** 只列时没有位点，列 mutate 条目代替表格。 */
function mutateList(result) {
  if (!result.mutate || !result.planOnly) return [];
  return ["mutate 条目：", ...result.mutate.map((m) => `- ${m}`)];
}

/** 抬头：基线、点名文件数、位点数与计数。 */
function headLine(result) {
  const pinned = result.pinned?.length ? `（点名 ${result.pinned.length} 个文件）` : "";
  const total = result.planOnly && result.mutate ? "由引擎生成" : result.summary.total;
  return `差分变异：基线 ${baseLabel(result.base, result.baseGiven)} 到工作树${pinned}；位点 ${total}${tallyText(result)}`;
}

/** 表格后的三段清单：存活的位点、运行时报错的位点、没有位点的改动段。 */
function trailingLists(result) {
  const lines = [];
  if (result.survivors.length) {
    lines.push("", "存活的位点：");
    for (const s of result.survivors) lines.push(`- ${s.file}:${s.line} ${s.unit}：${s.suggestion}`);
  }
  if (result.runtimeErrors?.length) {
    lines.push("", "运行时报错的位点：");
    for (const s of result.runtimeErrors) lines.push(`- ${s.file}:${s.line} ${s.unit}：${s.original} 换成 ${s.mutant === "" ? "（删去）" : s.mutant}`);
  }
  if (result.unmutated?.length) {
    lines.push("", "没有位点的改动段（不进分数）：");
    for (const u of result.unmutated) lines.push(`- ${u.file}:${u.lines[0]}-${u.lines[1]}${u.unit ? ` ${u.unit}` : ""}：${u.reason}`);
  }
  return lines;
}

export function formatMutation(result) {
  const { sites } = result;
  const lines = [headLine(result), ...baselineNotes(result), ...engineLine(result), ...mutateList(result)];
  if (result.planOnly && result.mutate) return lines.join("\n");
  lines.push("| 文件 | 单元 | 行 | 原文 | 替换 | 类别 | 裁定 |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const s of sites) lines.push(siteRow(s));
  if (sites.length === 0) lines.push("| | 没有位点 | | | | | |");
  lines.push(...trailingLists(result));
  if (result.resources) lines.push("", formatResources(result.resources));
  return lines.join("\n");
}

/** 一行资源摘要：容量、份额、并行度、优先级，以及跑过之后的一轮耗时。 */
export function formatResources(r) {
  const notes = [];
  if (r.capped) notes.push(`显式 --workers ${r.requested} 超过份额上限，按份额降到 ${r.workers}`);
  if (r.halved) notes.push(`可用内存 ${r.capacity.freeMemMb} MB 低于 ${r.lowMemoryHalveMb} MB，上限减半`);
  if (r.nice === null) notes.push("本平台不降优先级");
  if (r.timing) notes.push(`Stryker 一轮 ${r.timing.totalSeconds}s${r.timing.recheckSeconds ? `，复核 ${r.timing.recheckSeconds}s` : ""}，并行度启动时定下，运行中不调`);
  return `资源：${r.capacity.cpus} 核，负载 ${r.capacity.load1}，同机另有 ${r.otherHeavyTasks} 个重型任务，份额 ${Math.round(r.share * 100)}%，并行度 ${r.workers}${r.nice === null ? "" : `，nice ${r.nice}`}${notes.length ? "；" + notes.join("；") : ""}`;
}
