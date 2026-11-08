// 核 plan 与 spec 的骨架是否仍合模板：节在不在、顺序对不对、表头齐不齐、进度行与处置行格式对不对、每片有没有意义段与收口。
// 只核结构，不核内容好坏。必需节的字面与 ../plan-template.md、../spec-template.md 是同一份契约，改一处就改另一处；用例里有一条把两处钉在一起。

/** plan 必需的二级节，按顺序。匹配按「以此开头」，允许标题后带括号说明。 */
export const PLAN_SECTIONS = ["进度总览", "一程目标与前后差别", "预算与回看", "文档维护表", "切片", "顺序与并行", "一程交付声明"];
/** spec 必需的二级节，按顺序。 */
export const SPEC_SECTIONS = ["Problem Statement", "Solution", "依据与已定事项", "验收标准", "不变式对照", "原则与约束", "User Stories", "Implementation Decisions", "Testing Decisions"];
export const SLICE_TABLE_HEADER = "| 切片 | 交付的行为 | 对应验收 | 状态 |";
export const DOCS_TABLE_HEADER = "| 文档 | 给谁看 | 什么时候更新 | 只动哪一节 | 怎么判断过期 | 最近更新 |";
export const MEANING_ITEM = "- **交付这片的意义：**";
export const PROGRESS_RE = /^进度：\[[■□]{10}\] \d+\/\d+ 切片已完成.* · 更新 \d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z · head [0-9a-f]{7,40}$/;
export const DISPOSAL_RE = /^处置 (\d+)（/;

/** 把 Markdown 切成二级节：[{ title, start, end, lines }]，start 与 end 是 1 起的行号（含）。标题前的内容归 title 为 null 的首节。 */
export function sections(text) {
  const lines = text.split("\n");
  const out = [];
  let current = { title: null, start: 1, lines: [] };
  lines.forEach((line, i) => {
    const m = /^## (.+?)\s*$/.exec(line);
    if (m) {
      current.end = i;
      out.push(current);
      current = { title: m[1], start: i + 1, lines: [] };
    }
    current.lines.push(line);
  });
  current.end = lines.length;
  out.push(current);
  return out;
}

/** 必需节是否齐且顺序对；返回缺陷列表。 */
function checkSectionOrder(file, secs, required) {
  const defects = [];
  const titled = secs.filter((s) => s.title !== null);
  const found = required.map((name) => titled.find((s) => s.title === name || s.title.startsWith(`${name}（`)));
  required.forEach((name, i) => { if (!found[i]) defects.push({ file, line: null, message: `缺节「## ${name}」` }); });
  const present = found.filter(Boolean);
  for (let i = 1; i < present.length; i++) {
    if (present[i].start < present[i - 1].start) defects.push({ file, line: present[i].start, message: `节「## ${present[i].title}」应在「## ${present[i - 1].title}」之后` });
  }
  return defects;
}

const byTitle = (secs, name) => secs.find((s) => s.title === name || s.title?.startsWith(`${name}（`));
const hasLine = (sec, pred) => sec.lines.some(pred);
const lineNo = (sec, pred) => { const i = sec.lines.findIndex(pred); return i < 0 ? null : sec.start + i; };

/** 进度总览：进度行、当前行、切片表表头、切片号递增。 */
function checkOverview(file, sec) {
  const defects = [];
  const progress = sec.lines.find((l) => l.startsWith("进度："));
  if (!progress) defects.push({ file, line: sec.start, message: "进度总览缺进度行" });
  else if (!PROGRESS_RE.test(progress)) defects.push({ file, line: lineNo(sec, (l) => l === progress), message: "进度行格式错：应为「进度：[十格] n/N 切片已完成 · 更新 <UTC> · head <sha>」" });
  if (!hasLine(sec, (l) => /^当前：.+/.test(l))) defects.push({ file, line: sec.start, message: "进度总览缺当前行" });
  if (!hasLine(sec, (l) => l.trim() === SLICE_TABLE_HEADER)) defects.push({ file, line: sec.start, message: `切片表表头应为「${SLICE_TABLE_HEADER}」` });
  const ids = sliceTableIds(sec);
  for (let i = 1; i < ids.length; i++) if (Number(ids[i]) <= Number(ids[i - 1])) defects.push({ file, line: sec.start, message: `切片表切片号不递增：${ids[i - 1]} 后是 ${ids[i]}` });
  return defects;
}

/** 切片表里的切片号。 */
export function sliceTableIds(sec) {
  return sec.lines.map((l) => /^\|\s*(\d+)\s*\|/.exec(l.trim())?.[1]).filter(Boolean);
}

/** 一程目标：两个小标题都在，各有正文。 */
function checkNarrative(file, sec) {
  const defects = [];
  for (const head of ["### 产品层：", "### 技术层："]) {
    const i = sec.lines.findIndex((l) => l.startsWith(head));
    if (i < 0) { defects.push({ file, line: sec.start, message: `一程目标与前后差别缺「${head}」小标题` }); continue; }
    const body = sec.lines.slice(i + 1).findIndex((l) => l.startsWith("### "));
    const text = sec.lines.slice(i + 1, body < 0 ? undefined : i + 1 + body).filter((l) => l.trim() !== "");
    if (text.length === 0) defects.push({ file, line: sec.start + i, message: `「${head}」下没有正文` });
  }
  return defects;
}

/** 切片节：每个 ### NN： 都有意义段、开工包、收口；切片号与切片表一致。 */
function checkSlices(file, sec, tableIds) {
  const defects = [];
  const blocks = [];
  sec.lines.forEach((l, i) => { const m = /^### (\d+)：/.exec(l); if (m) blocks.push({ id: m[1], at: i }); });
  blocks.forEach((b, k) => {
    const body = sec.lines.slice(b.at, blocks[k + 1]?.at ?? sec.lines.length);
    const line = sec.start + b.at;
    if (!body.some((l) => l.startsWith(MEANING_ITEM))) defects.push({ file, line, message: `切片 ${b.id} 缺「${MEANING_ITEM}」` });
    if (!body.some((l) => l.startsWith("**开工包**"))) defects.push({ file, line, message: `切片 ${b.id} 缺「**开工包**」` });
    if (!body.some((l) => l.startsWith("**收口**"))) defects.push({ file, line, message: `切片 ${b.id} 缺「**收口**」` });
    if (!tableIds.includes(b.id)) defects.push({ file, line, message: `切片 ${b.id} 不在切片表里` });
  });
  for (const id of tableIds) if (!blocks.some((b) => b.id === id)) defects.push({ file, line: null, message: `切片表里的切片 ${id} 没有自己的「### ${id}：」节` });
  return defects;
}

/** 处置编号从 1 起按出现顺序连续。 */
function checkDisposals(file, text) {
  const defects = [];
  let expected = 1;
  text.split("\n").forEach((l, i) => {
    const m = DISPOSAL_RE.exec(l);
    if (!m) return;
    if (Number(m[1]) !== expected) defects.push({ file, line: i + 1, message: `处置编号断号：应为 ${expected}，写的是 ${m[1]}` });
    expected = Number(m[1]) + 1;
  });
  return defects;
}

/** 核一份 plan 文本，返回缺陷列表（空表示通过）。 */
export function checkPlan(text, file = "plan.md") {
  const defects = [];
  if (!/^# .+ 交付计划（revision \d+）\s*$/m.test(text)) defects.push({ file, line: 1, message: "抬头应为「# <一程名> 交付计划（revision <r>）」" });
  const secs = sections(text);
  defects.push(...checkSectionOrder(file, secs, PLAN_SECTIONS));
  const overview = byTitle(secs, "进度总览");
  if (overview) defects.push(...checkOverview(file, overview));
  const narrative = byTitle(secs, "一程目标与前后差别");
  if (narrative) defects.push(...checkNarrative(file, narrative));
  const docs = byTitle(secs, "文档维护表");
  if (docs && !hasLine(docs, (l) => l.trim() === DOCS_TABLE_HEADER)) defects.push({ file, line: docs.start, message: `文档维护表表头应为「${DOCS_TABLE_HEADER}」` });
  const slices = byTitle(secs, "切片");
  if (slices) defects.push(...checkSlices(file, slices, overview ? sliceTableIds(overview) : []));
  defects.push(...checkDisposals(file, text));
  return defects;
}

/** 核一份 spec 文本。 */
export function checkSpec(text, file = "spec.md") {
  const defects = [];
  if (!/^# .+ 实施规格（revision \d+[^）]*）\s*$/m.test(text)) defects.push({ file, line: 1, message: "抬头应为「# <一程名> 实施规格（revision <r>）」" });
  const secs = sections(text);
  defects.push(...checkSectionOrder(file, secs, SPEC_SECTIONS));
  const criteria = byTitle(secs, "验收标准");
  if (criteria && !hasLine(criteria, (l) => /^- C\d+/.test(l))) defects.push({ file, line: criteria.start, message: "验收标准里没有「- C<n>」条目" });
  return defects;
}

/** 文本输出：每条「文件:行 缺陷」，末尾一行汇总。 */
export function formatDefects(defects) {
  const lines = defects.map((d) => `${d.file}${d.line === null ? "" : `:${d.line}`} ${d.message}`);
  lines.push(defects.length === 0 ? "check-plan：结构合模板" : `check-plan：${defects.length} 处缺陷`);
  return lines.join("\n");
}
