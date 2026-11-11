// 核 plan 与 spec 的骨架是否仍合模板：节在不在、顺序对不对、表头齐不齐、进度行与处置行格式对不对、每片有没有意义段与收口、预计收尾超出人的验收窗口时有没有分程建议或人的决定、责任分级有没有带路径的重点行。
// 只核结构，不核内容好坏。必需节的字面与 ../plan-template.md、../spec-template.md 是同一份契约，改一处就改另一处；用例里有一条把两处钉在一起。

/** plan 必需的二级节，按顺序。匹配按「以此开头」，允许标题后带括号说明。 */
export const PLAN_SECTIONS = ["进度总览", "一程目标与前后差别", "预算与回看", "文档维护表", "切片", "圈外发现", "顺序与并行", "一程交付声明"];
/** spec 必需的二级节，按顺序。 */
export const SPEC_SECTIONS = ["Problem Statement", "Solution", "依据与已定事项", "验收标准", "不变式对照", "原则与约束", "User Stories", "Implementation Decisions", "Testing Decisions", "责任分级"];
/** spec「责任分级」与交接信息包「边界」里那张表的表头；哨兵按它的重点、次要、连带三行取路径。 */
export const SCOPE_TABLE_HEADER = "| 级别 | 成员与路径（反引号括起，可多个） | 本程对它做什么 |";
export const FINDINGS_TABLE_HEADER = "| 时刻 | 位置 | 现象 | 证据 | 挡住的验收（无或编号） | 处置（记录 / 绕法 / 停切片 NN） |";
/** 缺节时补一句加什么：只给责任分级接通的两节，其余节的名字已经说清。 */
const SECTION_HINTS = {
  责任分级: `在「## Out of Scope」之前加一张表，表头「${SCOPE_TABLE_HEADER}」，行为重点、次要、连带，格式见 spec 模板`,
  圈外发现: `在「## 顺序与并行」之前加一张表，表头「${FINDINGS_TABLE_HEADER}」，格式见 plan 模板`,
};
/** 交接信息包必需的二级节，按顺序。字面与 ../../single-session-dev-flow/handoff-pack-template.md 是同一份契约，用例把两处钉在一起。 */
export const HANDOFF_SECTIONS = ["目标", "依据", "不变式", "验收标准", "边界", "起点与风险", "已定事项", "只有人能定的待决", "四问"];
/** 起点一行：分支或引用、@、至少 7 位十六进制的提交号；分支与提交号可各自包在一对反引号里。 */
export const HANDOFF_START_RE = /^- 起点：(?:`[^`\s]+`|[^\s`]+)@(?:`[0-9a-f]{7,40}`|[0-9a-f]{7,40})\s*$/;
export const HANDOFF_START_MESSAGE = "起点一行应为「- 起点：<分支>@<提交号>」，提交号至少 7 位十六进制；分支与提交号可各自带反引号，例如「- 起点：main@0123abc」";
/** 整条答案是一个尖括号占位（如「<>」「<待补>」）：没答。 */
export const isPlaceholder = (answer) => /^<[^>]*>$/.test(answer);
export const SLICE_TABLE_HEADER = "| 切片 | 交付的行为 | 对应验收 | 状态 |";
export const DOCS_TABLE_HEADER = "| 文档 | 给谁看 | 什么时候更新 | 只动哪一节 | 怎么判断过期 | 最近更新 |";
export const MEANING_ITEM = "- **交付这片的意义：**";
/** 收口里「做好一轮」那一项：写代码的四条的第二条在切片循环里的位置，核它在不在。 */
export const POLISH_ITEM_RE = /^- \[[ x]\] 做好一轮/;
/** 收口里「改动成员的合入检查」那一项：与项目合入检查同口径、只限改动成员，过了合入检查才不会成为第一道检测器。 */
export const MERGE_CHECK_ITEM_RE = /^- \[[ x]\] 改动成员的合入检查/;
export const PROGRESS_RE = /^进度：\[[■□]{10}\] \d+\/\d+ 切片已完成.* · 更新 \d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z · head [0-9a-f]{7,40}$/;
/** 预计收尾一行：人打开 plan 就能看到还要多久。它是将来的时刻，不受「不晚于时钟」约束。 */
export const ETA_RE = /^预计收尾：\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z · 依据：\S.*$/;
export const DISPOSAL_RE = /^处置 (\d+)（/;
/** 子代理表的表头。token 一列加在最后，哨兵按位置读的开始与状态两列不动；核对器按表头名取列，旧表头（没有 token）照样认。 */
export const AGENTS_TABLE_HEADER = "| 子代理 | 用途 | 派发理由（派发门三条之一） | 模型与档位 | 开始 | 状态 | token |";
export const TOKEN_COLUMN = "token";
/** 结束了的子代理：状态是已合回或已结束，token 要从完成通知里抄进来。 */
const FINISHED_RE = /^(已合回|已结束)(?=$|[ ：（])/;
/** 子代理表的状态以状态词开头，说明写在后面的括号或冒号里。哨兵只按状态词判「在跑」，说明里出现「第 n/N 轮」不会被误读。 */
export const AGENT_STATUS_RE = /^(进行中|待验收|已合回|已丢弃|停下|已结束|第 \d+\/\d+ 轮)(?=$|[ ：（])/;
const AGENT_STATUS_WORDS = "进行中、待验收、已合回、已丢弃、停下、已结束、第 n/N 轮";
/** 文中的 UTC 时刻（到分或到秒）。 */
const TIME_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z/g;
/** 时刻比时钟晚多少才算估出来的：时刻只写到分，一分钟以内是读数的舍入。 */
const CLOCK_SLACK_MS = 60_000;

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
  required.forEach((name, i) => { if (!found[i]) defects.push({ file, line: null, message: `缺节「## ${name}」${SECTION_HINTS[name] ? `：${SECTION_HINTS[name]}` : ""}` }); });
  const present = found.filter(Boolean);
  for (let i = 1; i < present.length; i++) {
    if (present[i].start < present[i - 1].start) defects.push({ file, line: present[i].start, message: `节「## ${present[i].title}」应在「## ${present[i - 1].title}」之后` });
  }
  return defects;
}

const byTitle = (secs, name) => secs.find((s) => s.title === name || s.title?.startsWith(`${name}（`));
const hasLine = (sec, pred) => sec.lines.some(pred);
/** 表格行的单元格；不是表格行返回 null。 */
const cellsOf = (line) => (line.trim().startsWith("|") ? line.trim().slice(1, -1).split("|").map((c) => c.trim()) : null);
const lineNo = (sec, pred) => { const i = sec.lines.findIndex(pred); return i < 0 ? null : sec.start + i; };

/** 进度总览：进度行、当前行、切片表表头、切片号递增。 */
function checkOverview(file, sec) {
  const defects = [];
  const progress = sec.lines.find((l) => l.startsWith("进度："));
  if (!progress) defects.push({ file, line: sec.start, message: "进度总览缺进度行" });
  else if (!PROGRESS_RE.test(progress)) defects.push({ file, line: lineNo(sec, (l) => l === progress), message: "进度行格式错：应为「进度：[十格] n/N 切片已完成 · 更新 <UTC> · head <sha>」" });
  if (!hasLine(sec, (l) => /^当前：.+/.test(l))) defects.push({ file, line: sec.start, message: "进度总览缺当前行" });
  const eta = sec.lines.find((l) => l.startsWith("预计收尾："));
  if (!eta) defects.push({ file, line: sec.start, message: "进度总览缺预计收尾行：在当前行下面加「预计收尾：<UTC 时刻> · 依据：<剩余切片的预算，或最近的实测>」" });
  else if (!ETA_RE.test(eta)) defects.push({ file, line: lineNo(sec, (l) => l === eta), message: "预计收尾行格式错：应为「预计收尾：<UTC 时刻> · 依据：<一句>」" });
  if (!hasLine(sec, (l) => l.trim() === SLICE_TABLE_HEADER)) defects.push({ file, line: sec.start, message: `切片表表头应为「${SLICE_TABLE_HEADER}」` });
  const ids = sliceTableIds(sec);
  for (let i = 1; i < ids.length; i++) if (Number(ids[i]) <= Number(ids[i - 1])) defects.push({ file, line: sec.start, message: `切片表切片号不递增：${ids[i - 1]} 后是 ${ids[i]}` });
  defects.push(...agentStatusDefects(file, sec));
  return defects;
}

/**
 * 子代理表：表头首两格是「子代理」「用途」的那张表。按表头名取「状态」与「token」两列；
 * rows 是 [{ cells, line }]，从表头下的分隔行之后到第一行非表格行止，line 是 1 起的行号。没有这张表返回 null。
 */
function agentTable(sec) {
  const at = sec.lines.findIndex((l) => { const c = cellsOf(l); return c?.[0] === "子代理" && c[1] === "用途"; });
  if (at < 0) return null;
  const header = cellsOf(sec.lines[at]);
  const rows = [];
  for (let i = at + 2; i < sec.lines.length && cellsOf(sec.lines[i]); i++) rows.push({ cells: cellsOf(sec.lines[i]), line: sec.start + i });
  return { line: sec.start + at, status: header.indexOf("状态"), token: header.indexOf(TOKEN_COLUMN), rows };
}

/** 子代理表每行的状态格以状态词开头；有 token 一列的新模板，结束了的行 token 不能空。 */
function agentStatusDefects(file, sec) {
  const table = agentTable(sec);
  if (!table) return [];
  const defects = [];
  for (const { cells, line } of table.rows) {
    const status = cells[table.status] ?? "";
    if (!AGENT_STATUS_RE.test(status)) defects.push({ file, line, message: `子代理「${cells[0]}」的状态「${status}」不以状态词开头：状态词是 ${AGENT_STATUS_WORDS}，说明写在后面的括号或冒号里` });
    else if (table.token >= 0 && FINISHED_RE.test(status)) {
      const token = cells[table.token] ?? "";
      if (token === "" || isPlaceholder(token)) defects.push({ file, line, message: `子代理「${cells[0]}」状态是「${status}」，token 一格是空的：从完成通知里抄这个子代理用了多少 token` });
    }
  }
  return defects;
}

/** 晚于时钟的时刻：估出来的时刻会让哨兵与汇报件把先后读错。预计收尾与人的验收窗口两行写的是将来，除外。 */
function futureTimeDefects(file, text, now) {
  const defects = [];
  text.split("\n").forEach((l, i) => {
    if (l.startsWith("预计收尾：") || l.startsWith(WINDOW_LINE_PREFIX)) return;
    for (const m of l.matchAll(TIME_RE)) {
      if (Date.parse(m[0]) > now + CLOCK_SLACK_MS) defects.push({ file, line: i + 1, message: `时刻 ${m[0]} 晚于检查时的时钟 ${new Date(now).toISOString().slice(0, 16)}Z：时刻在写的那一刻读时钟，不估` });
    }
  });
  return defects;
}

/** 切片表里的切片号。 */
export function sliceTableIds(sec) {
  return sec.lines.map((l) => /^\|\s*(\d+)\s*\|/.exec(l.trim())?.[1]).filter(Boolean);
}

/** 切片表里每个切片号的状态格。 */
export function sliceStatuses(sec) {
  return new Map(sec.lines.map(cellsOf).filter((c) => /^\d+$/.test(c?.[0] ?? "")).map((c) => [c[0], c[3] ?? ""]));
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

/** 维护表「最近更新」允许的写法：UTC 时刻，或以「未」开头的状态（未生成、未派、未动）。 */
export const UPDATED_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z|未.*)$/;

/** 文档维护表：表头六列；每行最后一格是 UTC 时刻或「未…」，别的写法哨兵解析不了会静默跳过。 */
function checkDocsTable(file, sec) {
  const defects = [];
  if (!hasLine(sec, (l) => l.trim() === DOCS_TABLE_HEADER)) defects.push({ file, line: sec.start, message: `文档维护表表头应为「${DOCS_TABLE_HEADER}」` });
  sec.lines.forEach((l, i) => {
    const cells = cellsOf(l);
    if (!cells || cells.length !== 6 || cells[0] === "文档" || cells[0] === "---") return;
    if (!UPDATED_RE.test(cells[5])) defects.push({ file, line: sec.start + i, message: `文档维护表「最近更新」应是 UTC 时刻或「未…」，写的是「${cells[5]}」` });
  });
  return defects;
}

/** 进度总览里「思维模型：」一行开头。有这一行的是新模板，开工包的思维模型栏按缺陷核；没有的是旧模板，只给提示。 */
export const MODELS_LINE_PREFIX = "思维模型：";
/** 「思维模型：」一行列的技能名：六个思维模型加流程轴上横切的诤友。字面与 ../plan-template.md 是同一份契约；旧 plan 少了名字只提示。 */
export const MODEL_SKILLS = ["think-orthogonal", "think-ought-vs-is", "think-model-first", "think-right-then-well", "think-evidence", "think-closed-loop", "candid-friend"];
/** 开工包里思维模型的栏：上下文地图「切片开工包」一行里标「空」的格在 plan 模板里的栏名。字面与 ../plan-template.md 是同一份契约，用例把两处钉在一起。 */
export const KICKOFF_FIELDS = ["应然", "实然", "差异", "全化表", "做对", "做好一轮"];
/** 列表项的正文：去掉「- 」「1. 」与勾选框。不是列表项返回 null。 */
const itemText = (line) => /^\s*(?:[-*]|\d+\.)\s+(?:\[[ x]\]\s+)?(.*)$/.exec(line)?.[1] ?? null;
/** 一栏答过：「- 栏名：」或「1. 栏名：」后有内容，且不是整条尖括号占位。 */
const answered = (pack, name) => pack.some((l) => { const m = new RegExp(`^\\s*(?:-|\\d+\\.) ${name}：(.*)$`).exec(l); return m !== null && m[1].trim() !== "" && !isPlaceholder(m[1].trim()); });
/** 开工包已填：至少一个列表项有了自己写的内容，冒号后不空、也没有尖括号占位。照抄模板没改的不算。 */
const packFilled = (pack) => pack.some((l) => {
  const text = itemText(l);
  if (text === null || /<[^>]*>/.test(text)) return false;
  return text.slice(text.indexOf("：") + 1).trim() !== "";
});
/** 收口了的切片：已完成或跳过。其余（待做、进行中、受阻）都算未收口。 */
const closed = (status) => /^(已完成|跳过)/.test(status ?? "");

/** 切片的开工包：从「**开工包**」到「**收口**」之前。没有开工包返回 null。 */
function packOf(body) {
  const from = body.findIndex((l) => l.startsWith("**开工包**"));
  if (from < 0) return null;
  const to = body.findIndex((l) => l.startsWith("**收口**"));
  return { from, lines: body.slice(from + 1, to < 0 ? undefined : to) };
}

/** 未收口且开工包已填的切片缺的思维模型栏。 */
function missingFields(body, status) {
  const pack = packOf(body);
  if (!pack || closed(status) || !packFilled(pack.lines)) return { from: pack?.from ?? 0, names: [] };
  return { from: pack.from, names: KICKOFF_FIELDS.filter((name) => !answered(pack.lines, name)) };
}

function kickoffDefects(file, id, body, at, status) {
  const { from, names } = missingFields(body, status);
  return names.map((name) => ({ file, line: at + from, message: `切片 ${id} 未收口、开工包已填，缺「${name}」一栏：按 plan 模板在开工包里补「${name}：」一行` }));
}

/** 一个切片节自己的结构缺陷：意义段、开工包、收口，收口里有「做好一轮」。at 是切片标题的行号。 */
function sliceDefects(file, id, body, at) {
  const defects = [];
  if (!body.some((l) => l.startsWith(MEANING_ITEM))) defects.push({ file, line: at, message: `切片 ${id} 缺「${MEANING_ITEM}」` });
  if (!body.some((l) => l.startsWith("**开工包**"))) defects.push({ file, line: at, message: `切片 ${id} 缺「**开工包**」` });
  const closeout = body.findIndex((l) => l.startsWith("**收口**"));
  if (closeout < 0) defects.push({ file, line: at, message: `切片 ${id} 缺「**收口**」` });
  else {
    if (!body.slice(closeout).some((l) => POLISH_ITEM_RE.test(l))) defects.push({ file, line: at + closeout, message: `切片 ${id} 收口缺「做好一轮」` });
    if (!body.slice(closeout).some((l) => MERGE_CHECK_ITEM_RE.test(l))) defects.push({ file, line: at + closeout, message: `切片 ${id} 收口缺「改动成员的合入检查」` });
  }
  return defects;
}

/** 切片节里的每个切片：{ id, line, body }，line 是切片标题的行号。 */
function sliceBlocks(sec) {
  const heads = [];
  sec.lines.forEach((l, i) => { const m = /^### (\d+)：/.exec(l); if (m) heads.push({ id: m[1], at: i }); });
  return heads.map((h, k) => ({ id: h.id, line: sec.start + h.at, body: sec.lines.slice(h.at, heads[k + 1]?.at ?? sec.lines.length) }));
}

/** 切片节：每个 ### NN： 的结构缺陷，加上切片号与切片表一致。newTemplate 为真时核开工包的思维模型栏。 */
function checkSlices(file, sec, tableIds, statuses, newTemplate) {
  const defects = [];
  const blocks = sliceBlocks(sec);
  for (const b of blocks) {
    defects.push(...sliceDefects(file, b.id, b.body, b.line));
    if (newTemplate) defects.push(...kickoffDefects(file, b.id, b.body, b.line, statuses.get(b.id)));
    if (!tableIds.includes(b.id)) defects.push({ file, line: b.line, message: `切片 ${b.id} 不在切片表里` });
  }
  for (const id of tableIds) if (!blocks.some((b) => b.id === id)) defects.push({ file, line: null, message: `切片表里的切片 ${id} 没有自己的「### ${id}：」节` });
  return defects;
}

const hasModelsLine = (overview) => overview.lines.some((l) => l.startsWith(MODELS_LINE_PREFIX));

/** 「预算与回看」里人的验收窗口一行。有这一行的是带诤友的新模板，预计收尾对窗口按缺陷核；没有的只给提示。字面与 ../plan-template.md 是同一份契约。 */
export const WINDOW_LINE_PREFIX = "- 人的验收窗口：";
/** 窗口一行：回来的 UTC 时刻，再写验收多久。只取回来的时刻，验收时长是给人读的。 */
export const WINDOW_RE = /^- 人的验收窗口：回来 (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z) · 验收 \S/;
/** 处置记录里人说就按一程做：处置行里有「按一程做」四个字。 */
const ONE_RUN_RE = /^处置 \d+（.*按一程做/;
/** 切片的「人怎么验」写「无」：这片人上手看不到。 */
const NO_HUMAN_CHECK_RE = /^- \*\*人怎么验：\*\*\s*无(?:$|[。；，\s（])/;

/** 分程建议一节写了：表里至少一行不全是尖括号占位。照抄模板没改的不算。 */
function splitWritten(secs) {
  const sec = byTitle(secs, "分程建议");
  return Boolean(sec?.lines.map(cellsOf).some((c) => c && /^\d+$/.test(c[0]) && c.slice(1).some((x) => x !== "" && !isPlaceholder(x))));
}

/** 人的验收窗口：一行在就核格式；预计收尾晚于回来的时刻时，要有写了的分程建议，或人说按一程做的处置。没有这一行的旧 plan 不核。 */
function windowDefects(file, text, secs) {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.startsWith(WINDOW_LINE_PREFIX));
  if (at < 0) return [];
  const m = WINDOW_RE.exec(lines[at]);
  if (!m) return [{ file, line: at + 1, message: "人的验收窗口一行格式错：应为「- 人的验收窗口：回来 <UTC 时刻> · 验收 <分钟数> 分钟（<人的原话>）」" }];
  const eta = /^预计收尾：(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z)/m.exec(text)?.[1];
  if (!eta || Date.parse(eta) <= Date.parse(m[1])) return [];
  if (splitWritten(secs) || lines.some((l) => ONE_RUN_RE.test(l))) return [];
  return [{ file, line: at + 1, message: `预计收尾 ${eta} 晚于人回来的时刻 ${m[1]}：一程大过人验得完的量。在 plan 末尾写「## 分程建议」；人说就按一程做时，在处置记录里记一行「处置 <n>（<UTC 时刻>）：按一程做；人的原话：<>」` }];
}

/** 切片写「人怎么验：无」的提示：人上手看不到的片只是中间产物。 */
function noHumanCheckHints(file, secs) {
  const slices = byTitle(secs, "切片");
  if (!slices) return [];
  return sliceBlocks(slices).flatMap((b) => {
    const i = b.body.findIndex((l) => NO_HUMAN_CHECK_RE.test(l));
    return i < 0 ? [] : [{ file, line: b.line + i, message: `切片 ${b.id} 的「人怎么验」写的是无：人上手看不到这片的行为，它只是中间产物，考虑并进能看到的那一片` }];
  });
}

/**
 * 提示：不算缺陷、不改退出码的几条。旧模板的 plan 没有「思维模型：」一行，开工包的思维模型栏不按缺陷核，
 * 提示加上这一行，并列出加上之后要补的栏；有这一行但少了模板列的技能名，提示补上；子代理表没有 token 一列，
 * 结束了的行不核 token，提示加上这一列；没有「人的验收窗口」一行，预计收尾对窗口不按缺陷核，提示加上它。
 * 有窗口一行的新模板，切片写「人怎么验：无」的给提示。已有的 plan 不因模板升级而无故变红。
 */
export function planHints(text, file = "plan.md") {
  const secs = sections(text);
  const overview = byTitle(secs, "进度总览");
  if (!overview) return [];
  const hints = [];
  if (!hasModelsLine(overview)) {
    const slices = byTitle(secs, "切片");
    const statuses = sliceStatuses(overview);
    const owed = slices ? sliceBlocks(slices).map((b) => ({ id: b.id, names: missingFields(b.body, statuses.get(b.id)).names })).filter((s) => s.names.length) : [];
    const tail = owed.length ? `；加上之后要补：${owed.map((s) => `切片 ${s.id} 缺${s.names.map((n) => `「${n}」`).join("")}`).join("，")}` : "";
    hints.push({ file, line: overview.start, message: `进度总览没有「${MODELS_LINE_PREFIX}」一行，按旧模板核，开工包的思维模型栏只提示、不报缺陷。照 plan 模板加上这一行，上下文压缩之后按它重新加载思维模型技能${tail}` });
  } else {
    const at = overview.lines.findIndex((l) => l.startsWith(MODELS_LINE_PREFIX));
    const missing = MODEL_SKILLS.filter((name) => !overview.lines[at].includes(`\`${name}\``));
    if (missing.length) hints.push({ file, line: overview.start + at, message: `进度总览的「${MODELS_LINE_PREFIX}」一行没有${missing.map((n) => `\`${n}\``).join("、")}，按旧模板核，只提示、不报缺陷。照 plan 模板补上，上下文压缩之后按这一行重新加载` });
  }
  const agents = agentTable(overview);
  if (agents && agents.token < 0) hints.push({ file, line: agents.line, message: `子代理表没有「${TOKEN_COLUMN}」一列，按旧模板核，token 只提示、不报缺陷。照 plan 模板在表的最后加这一列，数从完成通知里抄` });
  const budget = byTitle(secs, "预算与回看");
  if (!text.split("\n").some((l) => l.startsWith(WINDOW_LINE_PREFIX))) hints.push({ file, line: budget?.start ?? overview.start, message: `「预算与回看」没有「${WINDOW_LINE_PREFIX}」一行，按旧模板核，预计收尾对人的验收窗口只提示、不报缺陷。照 plan 模板加上这一行，写人什么时候回来、有多少时间上手验收` });
  else hints.push(...noHumanCheckHints(file, secs));
  return hints;
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

/** 核一份 plan 文本，返回缺陷列表（空表示通过）。now 是检查时的时钟（毫秒），缺省取当前时刻。 */
export function checkPlan(text, file = "plan.md", { now = Date.now() } = {}) {
  const defects = [];
  if (!/^# .+ 交付计划（revision \d+）\s*$/m.test(text)) defects.push({ file, line: 1, message: "抬头应为「# <一程名> 交付计划（revision <r>）」" });
  const secs = sections(text);
  defects.push(...checkSectionOrder(file, secs, PLAN_SECTIONS));
  const overview = byTitle(secs, "进度总览");
  if (overview) defects.push(...checkOverview(file, overview));
  const narrative = byTitle(secs, "一程目标与前后差别");
  if (narrative) defects.push(...checkNarrative(file, narrative));
  const docs = byTitle(secs, "文档维护表");
  if (docs) defects.push(...checkDocsTable(file, docs));
  const slices = byTitle(secs, "切片");
  if (slices) defects.push(...checkSlices(file, slices, overview ? sliceTableIds(overview) : [], overview ? sliceStatuses(overview) : new Map(), overview ? hasModelsLine(overview) : false));
  defects.push(...checkDisposals(file, text));
  defects.push(...windowDefects(file, text, secs));
  defects.push(...futureTimeDefects(file, text, now));
  return defects;
}

/** 责任分级：要有重点行，每个重点行至少一个反引号括起的路径；哨兵靠这些路径判圈外改动。 */
function checkScope(file, sec) {
  const keyRows = sec.lines.map((l, i) => ({ cells: cellsOf(l), line: sec.start + i })).filter((r) => r.cells?.[0] === "重点");
  if (keyRows.length === 0) return [{ file, line: sec.start, message: "责任分级表没有「重点」行：加一行「| 重点 | `<成员或目录>` | <本程对它做什么> |」" }];
  return keyRows.filter((r) => !/`[^`]+`/.test(r.cells[1] ?? "")).map((r) => ({ file, line: r.line, message: "责任分级「重点」行没有反引号括起的路径：把成员或目录写成 `<路径>`，可写多个" }));
}

/** 责任分级三级里反引号括起的路径，去掉开头的 ./ 与结尾的 /。 */
export const scopePaths = (sec) => sec.lines.map(cellsOf).filter((c) => ["重点", "次要", "连带"].includes(c?.[0]))
  .flatMap((c) => [...(c[1] ?? "").matchAll(/`([^`]+)`/g)].map((m) => normalizePath(m[1])));
export const normalizePath = (p) => p.replace(/^\.\//, "").replace(/\/+$/, "");
/** 路径落在某条范围路径上：就是它，或在它这个目录下。pkg/a 不盖 pkg/ab。与哨兵判圈外改动同一取法。 */
export const covered = (path, paths) => paths.some((p) => path === p || path.startsWith(`${p}/`));

/** 验收标准的条目：「- C<n> …」连同紧跟其后的缩进续行，[{ id, line, text }]。空行或不缩进的行结束一条。 */
function criteriaOf(sec) {
  const out = [];
  let open = null;
  sec.lines.forEach((l, i) => {
    const m = /^- (C\d+)\b/.exec(l);
    if (m) out.push((open = { id: m[1], line: sec.start + i, text: l }));
    else if (open && /^\s+\S/.test(l)) open.text += `\n${l}`;
    else open = null;
  });
  return out;
}

/**
 * 每条验收写明经过的成员（「经过：`路径`」），每个路径都在责任分级里；
 * 写了「按范围验收：」的不核范围外的路径：这条验收依赖了范围外的工作，已经按范围收窄并写明归谁。
 */
function criteriaScopeDefects(file, criteria, scope) {
  const paths = scope ? scopePaths(scope) : [];
  return criteria.flatMap((c) => {
    const byScope = /按范围验收：\S/.test(c.text);
    const via = c.text.split("经过：").slice(1).join(" ");
    const passes = [...via.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (passes.length === 0 && !byScope) return [{ file, line: c.line, message: `${c.id} 没写经过的成员：在这条里写「经过：\`<成员或目录>\`」；它经过范围外的成员时改写「按范围验收：<范围内验到哪>；范围外部分归<谁>」` }];
    if (byScope || !scope) return [];
    return passes.filter((p) => !covered(normalizePath(p), paths)).map((p) => ({ file, line: c.line, message: `${c.id} 经过的 \`${p}\` 不在责任分级里：本程改动带出的消费者就补进责任分级；否则这条写「按范围验收：<范围内验到哪>；范围外部分归<谁>」` }));
  });
}

/** 核一份 spec 文本。now 同 checkPlan。 */
export function checkSpec(text, file = "spec.md", { now = Date.now() } = {}) {
  const defects = [];
  if (!/^# .+ 实施规格（revision \d+[^）]*）\s*$/m.test(text)) defects.push({ file, line: 1, message: "抬头应为「# <一程名> 实施规格（revision <r>）」" });
  const secs = sections(text);
  defects.push(...checkSectionOrder(file, secs, SPEC_SECTIONS));
  const criteria = byTitle(secs, "验收标准");
  const scope = byTitle(secs, "责任分级");
  const scopeDefects = scope ? checkScope(file, scope) : [];
  if (criteria && !hasLine(criteria, (l) => /^- C\d+/.test(l))) defects.push({ file, line: criteria.start, message: "验收标准里没有「- C<n>」条目" });
  // 责任分级本身有缺陷时只报它：路径还不全，按它核验收经过的成员只会连带出一串假缺陷。
  else if (criteria) defects.push(...criteriaScopeDefects(file, criteriaOf(criteria), scope && scopeDefects.length === 0 ? scope : null));
  defects.push(...scopeDefects);
  defects.push(...futureTimeDefects(file, text, now));
  return defects;
}

/** 四问的第 n 条：「n. 问题？答案」，答案不是空，也不是整条尖括号占位（「<>」「<待只读核对后填>」都算没答）。 */
function fourQuestionDefects(file, sec) {
  return [1, 2, 3, 4].flatMap((n) => {
    const at = sec.lines.findIndex((l) => l.startsWith(`${n}. `));
    const answer = at < 0 ? "" : (sec.lines[at].split("？").slice(1).join("？").trim());
    return answer === "" || isPlaceholder(answer) ? [{ file, line: at < 0 ? sec.start : sec.start + at, message: `四问第 ${n} 条没有答案` }] : [];
  });
}

/** 交接信息包：抬头、九节齐且顺序对、边界带责任分级表、起点一行带提交号、四问四条都有答案。 */
export function checkHandoff(text, file = "handoff.md") {
  const defects = [];
  if (!/^# 交接信息包：.+$/m.test(text)) defects.push({ file, line: 1, message: "抬头应为「# 交接信息包：<一程名>」" });
  const secs = sections(text);
  defects.push(...checkSectionOrder(file, secs, HANDOFF_SECTIONS));
  const bounds = byTitle(secs, "边界");
  if (bounds && !hasLine(bounds, (l) => l.trim() === SCOPE_TABLE_HEADER)) defects.push({ file, line: bounds.start, message: `边界缺责任分级表：加一张与 spec「责任分级」同格式的表，表头「${SCOPE_TABLE_HEADER}」，写范围从它派生` });
  const start = byTitle(secs, "起点与风险");
  if (start && !hasLine(start, (l) => HANDOFF_START_RE.test(l))) defects.push({ file, line: start.start, message: HANDOFF_START_MESSAGE });
  const four = byTitle(secs, "四问");
  if (four) defects.push(...fourQuestionDefects(file, four));
  return defects;
}

/** 命令面给了哪几份就核哪几份：{ plan, spec, handoff } 是路径，read 把路径读成文本。 */
export function checkFiles({ plan, spec, handoff, now = Date.now() }, read) {
  return [
    ...(plan ? checkPlan(read(plan), plan, { now }) : []),
    ...(spec ? checkSpec(read(spec), spec, { now }) : []),
    ...(handoff ? checkHandoff(read(handoff), handoff) : []),
  ];
}

/** 命令面给了 plan 时的提示；spec 与交接信息包没有提示。 */
export const hintFiles = ({ plan }, read) => (plan ? planHints(read(plan), plan) : []);

/** 文本输出：每条「文件:行 缺陷」，再每条「文件:行 提示：…」，末尾一行汇总。提示不算缺陷。 */
export function formatDefects(defects, hints = []) {
  const at = (d) => `${d.file}${d.line === null ? "" : `:${d.line}`}`;
  const lines = [...defects.map((d) => `${at(d)} ${d.message}`), ...hints.map((h) => `${at(h)} 提示：${h.message}`)];
  const tail = hints.length ? `，${hints.length} 条提示` : "";
  lines.push(defects.length === 0 ? `check-plan：结构合模板${tail}` : `check-plan：${defects.length} 处缺陷${tail}`);
  return lines.join("\n");
}
