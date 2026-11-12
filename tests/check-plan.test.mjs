// check-plan：按模板核 plan 与 spec 的骨架。
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkFiles, checkHandoff, checkPlan, checkSpec, handoffHints, hintFiles, planHints, sections, HANDOFF_ETA_PREFIX, HANDOFF_SECTIONS, KICKOFF_FIELDS, MODEL_SKILLS, MODELS_LINE_PREFIX, OUTLINE_TABLE_HEADER, PLAN_SECTIONS, TOKEN_COLUMN, SPEC_SECTIONS, WINDOW_LINE_PREFIX, WINDOW_RE } from "../skills/spec-and-plan/scripts/lib/check-plan.mjs";

const SCRIPT = new URL("../skills/spec-and-plan/scripts/check-plan.mjs", import.meta.url).pathname;
const TEMPLATE = new URL("../skills/spec-and-plan/plan-template.md", import.meta.url).pathname;
const SPEC_TEMPLATE = new URL("../skills/spec-and-plan/spec-template.md", import.meta.url).pathname;
const HANDOFF_TEMPLATE = new URL("../skills/pass-the-baton/handoff-pack-template.md", import.meta.url).pathname;

/** 模板正文（分隔线之后），把三个机读占位符换成合法值。 */
const instantiate = (path) => readFileSync(path, "utf8").split("\n---\n").slice(1).join("\n---\n")
  .replaceAll("<UTC 时间>", "2026-11-08T10:00Z").replaceAll("<UTC 时刻>", "2026-11-08T10:00Z").replaceAll("<短 sha>", "0123abc").replaceAll("<N>", "1").replaceAll("<r>", "1");

const GOOD_PLAN = `# 示例 交付计划（revision 1）

## 进度总览

进度：[■■■■■□□□□□] 1/2 切片已完成 · 更新 2026-11-08T10:00Z · head 0123abc
当前：切片 02 开工包
预计收尾：2026-11-08T12:00Z · 依据：剩一片，预算 2 小时
思维模型：拆 \`think-orthogonal\` · 找差异 \`think-ought-vs-is\` · 定形 \`think-model-first\` · 建 \`think-right-then-well\` · 证 \`think-evidence\` · 转手 \`think-closed-loop\` · 问 \`think-unknowns\` · 对人 \`candid-friend\`

| 切片 | 交付的行为 | 对应验收 | 状态 |
| --- | --- | --- | --- |
| 01 | 第一片 | C1 | 已完成 0123abc |
| 02 | 第二片 | C2 | 待做 |

| 子代理 | 用途 | 派发理由（派发门三条之一） | 模型与档位 | 开始 | 状态 | token |
| --- | --- | --- | --- | --- | --- | --- |
| 写者 | 切片 01 | 理由二 | 默认档 | 2026-11-08T08:00Z | 已合回 0123abc | 43 万 |
| 哨兵 | 哨兵，45 分钟，4 轮 | 理由二 | 便宜档 | 2026-11-08T08:00Z | 第 2/4 轮 |  |

处置 1（2026-11-08T09:00Z）：继续；无信号。
处置 2（2026-11-08T09:45Z）：继续；无信号。

## 一程目标与前后差别

### 产品层：用的人得到什么

一段话。

### 技术层：哪一块变了

一段话。

## 预算与回看

- 预算 1 小时。
- 人的验收窗口：回来 2026-11-08T18:00Z · 验收 60 分钟（缺省：当天回来，验收一小时）

## 文档维护表

| 文档 | 给谁看 | 什么时候更新 | 只动哪一节 | 怎么判断过期 | 最近更新 |
| --- | --- | --- | --- | --- | --- |
| plan.md | 人 | 每次提交 | 进度总览 | head 不对 | 2026-11-08T10:00Z |

## 切片

### 01：第一片

- **交付：** 一句。
- **交付这片的意义：** 对用户，能看到；对系统，改了。

**开工包**

- 上下文增量：无

**收口**

- [x] 做好一轮：本片不需要：示例。
- [x] 改动成员的合入检查：\`npm run check\` 退出 0
- [x] 提交

### 02：第二片

- **交付：** 一句。
- **交付这片的意义：** 对用户，能看到；对系统，改了。

**开工包**：开工时填。

**收口**

- [ ] 做好一轮：
- [ ] 改动成员的合入检查：
- [ ] 提交

## 圈外发现

| 时刻 | 位置 | 现象 | 证据 | 挡住的验收（无或编号） | 处置（记录 / 绕法 / 停切片 NN） |
| --- | --- | --- | --- | --- | --- |

## 顺序与并行

- 01 → 02

## 一程交付声明（示例）

- [ ] 五项
`;

const GOOD_SPEC = `# 示例 实施规格（revision 1；每加一条例外升一号）

## Problem Statement

问题。

## Solution

方案。

## 依据与已定事项

| 依据 | 精确修订与链接 | 本程采用的范围 |
| --- | --- | --- |

## 验收标准

- C1 第一条。经过：\`pkg/a/\`、\`pkg/b/x.ts\`
- C2 第二条
  第二行说明。经过：\`pkg/b2\`

## 不变式对照

| 不变式 | 守法 | 验证 |
| --- | --- | --- |

## 原则与约束

按 ub-mode 全文。

## User Stories

1. 作为人，我要看懂。

## Implementation Decisions

- 无

## Testing Decisions

- 无

## 责任分级

| 级别 | 成员与路径（反引号括起，可多个） | 本程对它做什么 |
| --- | --- | --- |
| 重点 | \`pkg/a/\` | 兑现 C1 |
| 次要 | \`pkg/b/\`、\`pkg/b2/\` | 同步契约的消费者 |
| 连带 | 无 | 无 |

圈外：其余一切。

## Out of Scope

- 无
`;

const run = (args) => spawnSync("node", [SCRIPT, ...args], { encoding: "utf8" });

test("sections 按二级标题切，首节 title 为 null，行号 1 起", () => {
  const s = sections("头\n## A\nx\n## B（说明）\ny\n");
  assert.deepEqual(s.map((x) => [x.title, x.start]), [[null, 1], ["A", 2], ["B（说明）", 4]]);
});

test("好 plan 与好 spec 没有缺陷；模板实例化后也通过，把模板与核对器钉在一起", () => {
  assert.deepEqual(checkPlan(GOOD_PLAN), []);
  assert.deepEqual(checkSpec(GOOD_SPEC), []);
  assert.deepEqual(checkPlan(instantiate(TEMPLATE)).map((d) => d.message), []);
  assert.deepEqual(checkSpec(instantiate(SPEC_TEMPLATE)).map((d) => d.message), []);
  assert.deepEqual(PLAN_SECTIONS.length, 8);
  assert.deepEqual(SPEC_SECTIONS.length, 10);
});

test("六种坏 plan 各报对应缺陷：缺节、节顺序错、进度行格式错、切片缺意义段、处置断号、维护表表头少列", () => {
  const messages = (text) => checkPlan(text).map((d) => d.message);
  assert.ok(messages(GOOD_PLAN.replace("## 文档维护表", "## 别的表")).some((m) => m === "缺节「## 文档维护表」"));
  const swapped = GOOD_PLAN.replace("## 一程目标与前后差别", "## 临时").replace("## 预算与回看", "## 一程目标与前后差别").replace("## 临时", "## 预算与回看");
  assert.ok(messages(swapped).includes("节「## 预算与回看」应在「## 一程目标与前后差别」之后"), messages(swapped).join("|"));
  const badProgress = checkPlan(GOOD_PLAN.replace("· head 0123abc", "· head"));
  assert.deepEqual(badProgress.map((d) => [d.line, d.message.split("：")[0]]), [[5, "进度行格式错"]], "行号指向进度行");
  assert.ok(messages(GOOD_PLAN.replace("| 切片 | 交付的行为 | 对应验收 | 状态 |", "| 切片 | 行为 | 验收 | 状态 |")).some((m) => m.startsWith("切片表表头应为")));
  const noMeaning = checkPlan(GOOD_PLAN.replace("- **交付这片的意义：** 对用户，能看到；对系统，改了。\n\n**开工包**：开工时填。", "**开工包**：开工时填。"));
  assert.deepEqual(noMeaning.map((d) => [d.line, d.message]), [[GOOD_PLAN.split("\n").indexOf("### 02：第二片") + 1, "切片 02 缺「- **交付这片的意义：**」"]], "行号指向切片标题");
  assert.ok(messages(GOOD_PLAN.replace("处置 2（", "处置 3（")).some((m) => m === "处置编号断号：应为 2，写的是 3"));
  assert.ok(messages(GOOD_PLAN.replace("| 怎么判断过期 | 最近更新 |", "| 最近更新 |")).some((m) => m.startsWith("文档维护表表头应为")));
  assert.deepEqual(checkPlan(GOOD_PLAN.replace("| head 不对 | 2026-11-08T10:00Z |", "| head 不对 | 10 点（刚改） |")).map((d) => [d.line, d.message]), [[GOOD_PLAN.split("\n").findIndex((l) => l.includes("| head 不对 |")) + 1, "文档维护表「最近更新」应是 UTC 时刻或「未…」，写的是「10 点（刚改）」"]]);
  assert.deepEqual(checkPlan(GOOD_PLAN.replace("| head 不对 | 2026-11-08T10:00Z |", "| head 不对 | 未生成 |")), [], "「未…」是允许的状态");
});

test("其余缺陷：抬头没 revision、缺进度行、切片表切片号不递增、切片不在表里、表里的切片没有节、目标节没正文、spec 缺节与缺 C 条目", () => {
  const messages = (text) => checkPlan(text).map((d) => d.message);
  assert.ok(messages(GOOD_PLAN.replace("交付计划（revision 1）", "交付计划")).some((m) => m.startsWith("抬头应为")));
  assert.ok(messages(GOOD_PLAN.replace(/^进度：.*$/m, "")).includes("进度总览缺进度行"));
  assert.ok(messages(GOOD_PLAN.replace("| 02 | 第二片", "| 01 | 第二片")).includes("切片表切片号不递增：01 后是 01"));
  assert.ok(messages(GOOD_PLAN.replace("### 02：第二片", "### 03：第二片")).includes("切片 03 不在切片表里"));
  assert.ok(messages(GOOD_PLAN.replace("### 02：第二片", "### 03：第二片")).includes("切片表里的切片 02 没有自己的「### 02：」节"));
  const noBody = checkPlan(GOOD_PLAN.replace("### 技术层：哪一块变了\n\n一段话。", "### 技术层：哪一块变了\n"));
  assert.deepEqual(noBody.map((d) => [d.line, d.message]), [[GOOD_PLAN.split("\n").indexOf("### 技术层：哪一块变了") + 1, "「### 技术层：」下没有正文"]], "行号指向小标题");
  const spec = (text) => checkSpec(text).map((d) => d.message);
  assert.ok(spec(GOOD_SPEC.replace("## User Stories", "## Stories")).includes("缺节「## User Stories」"));
  assert.ok(spec(GOOD_SPEC.replace(/- C1 第一条[^]*?`pkg\/b2`\n/, "- 第一条\n")).includes("验收标准里没有「- C<n>」条目"));
});

test("责任分级：spec 缺这一节、表里没有重点行、重点行没有反引号路径，各报一处，消息写明加什么", () => {
  const at = (text, needle) => text.split("\n").findIndex((l) => l.startsWith(needle)) + 1;
  assert.deepEqual(checkSpec(GOOD_SPEC.replace("## 责任分级", "## 别的分级")).map((d) => [d.line, d.message]), [[null, "缺节「## 责任分级」：在「## Out of Scope」之前加一张表，表头「| 级别 | 成员与路径（反引号括起，可多个） | 本程对它做什么 |」，行为重点、次要、连带，格式见 spec 模板"]]);
  const noKey = GOOD_SPEC.replace(/^\| 重点 \|.*\n/m, "");
  assert.deepEqual(checkSpec(noKey).map((d) => [d.line, d.message]), [[at(noKey, "## 责任分级"), "责任分级表没有「重点」行：加一行「| 重点 | `<成员或目录>` | <本程对它做什么> |」"]], "行号指向节标题");
  const noPath = GOOD_SPEC.replace("| 重点 | `pkg/a/` |", "| 重点 | pkg/a/ |");
  assert.deepEqual(checkSpec(noPath).map((d) => [d.line, d.message]), [[at(noPath, "| 重点 |"), "责任分级「重点」行没有反引号括起的路径：把成员或目录写成 `<路径>`，可写多个"]], "行号指向重点行");
  assert.deepEqual(checkSpec(GOOD_SPEC.replace("| 连带 | 无 | 无 |", "| 连带 | `docs/` | 回归 |")), [], "连带可以写路径也可以写无");
  assert.deepEqual(checkSpec(GOOD_SPEC.replace("| 重点 | `pkg/a/` |", "| 重点 | 成员 a：`pkg/a/`、`pkg/a2/` |")), [], "反引号路径前可带成员名");
  const outOfSection = GOOD_SPEC.replace(/^\| 重点 \|.*\n/m, "").replace("## Out of Scope\n", "## Out of Scope\n\n| 重点 | `pkg/a/` | 不在责任分级节里 |\n");
  assert.ok(checkSpec(outOfSection).some((d) => d.message.startsWith("责任分级表没有「重点」行")), "别的节里的重点行不算");
});

test("圈外发现：plan 缺这一节报一处，消息写明加什么；节顺序要在切片与顺序与并行之间", () => {
  assert.deepEqual(checkPlan(GOOD_PLAN.replace("## 圈外发现", "## 别的发现")).map((d) => d.message), ["缺节「## 圈外发现」：在「## 顺序与并行」之前加一张表，表头「| 时刻 | 位置 | 现象 | 证据 | 挡住的验收（无或编号） | 处置（记录 / 绕法 / 停切片 NN） |」，格式见 plan 模板"]);
  const moved = GOOD_PLAN.replace(/## 圈外发现\n\n\| 时刻.*\n\| ---.*\n\n/, "").replace("## 一程交付声明", "## 圈外发现\n\n## 一程交付声明");
  assert.deepEqual(checkPlan(moved).map((d) => d.message), ["节「## 顺序与并行」应在「## 圈外发现」之后"]);
  assert.deepEqual(checkPlan(GOOD_PLAN.replace("## 圈外发现", "## 圈外发现（处置按入口的规则）")), [], "标题后可带括号说明");
});

test("交接信息包：边界缺责任分级表报一处，行号指向边界节；表在别的节里不算", () => {
  const lines = GOOD_HANDOFF.split("\n");
  const header = "| 级别 | 成员与路径（反引号括起，可多个） | 本程对它做什么 |";
  assert.ok(lines.includes(header), "模板的边界节带责任分级表");
  const noTable = GOOD_HANDOFF.replace(header, "| 层 | 路径 | 做什么 |");
  assert.deepEqual(checkHandoff(noTable).map((d) => [d.line, d.message]), [[lines.indexOf("## 边界") + 1, `边界缺责任分级表：加一张与 spec「责任分级」同格式的表，表头「${header}」，写范围从它派生`]]);
  const elsewhere = noTable.replace("## 已定事项\n", `## 已定事项\n\n${header}\n`);
  assert.deepEqual(checkHandoff(elsewhere).map((d) => d.message), [`边界缺责任分级表：加一张与 spec「责任分级」同格式的表，表头「${header}」，写范围从它派生`]);
});

test("收口缺「做好一轮」报缺陷，行号指向那片的「**收口**」；勾没勾都算在", () => {
  const noPolish = GOOD_PLAN.replace("- [ ] 做好一轮：\n", "");
  const lines = noPolish.split("\n");
  const closeoutOf02 = lines.findIndex((l, i) => l.startsWith("**收口**") && i > lines.indexOf("### 02：第二片"));
  assert.deepEqual(checkPlan(noPolish).map((d) => [d.line, d.message]), [[closeoutOf02 + 1, "切片 02 收口缺「做好一轮」"]]);
  assert.deepEqual(checkPlan(GOOD_PLAN.replace("- [ ] 做好一轮：", "- [x] 做好一轮：只改了命名")), [], "勾上也合格");
  assert.ok(checkPlan(GOOD_PLAN.replace("- [x] 做好一轮：本片不需要：示例。\n", "做好一轮写在收口外\n- [x] 提交\n")).some((d) => d.message === "切片 01 收口缺「做好一轮」"), "不是勾选项的同名文字不算");

  const only01 = (text) => checkPlan(text).filter((d) => d.message.startsWith("切片 01")).map((d) => d.message);
  assert.deepEqual(only01(GOOD_PLAN.replace("- [x] 做好一轮：本片不需要：示例。", "x - [x] 做好一轮：本片不需要：示例。")), ["切片 01 收口缺「做好一轮」"], "勾选项要在行首");
  assert.deepEqual(only01(GOOD_PLAN.replace("**开工包**\n\n- 上下文增量：无", "**开工包**\n\n- [x] 做好一轮：写在开工包里").replace("- [x] 做好一轮：本片不需要：示例。\n", "")), ["切片 01 收口缺「做好一轮」"], "收口之前的同名勾选项不算");
  assert.deepEqual(only01(GOOD_PLAN.replace("**收口**\n\n- [x] 做好一轮", "**收口**（2026-11-08T10:00Z）\n\n- [x] 做好一轮")), [], "收口标题后面可以跟时刻");
  assert.deepEqual(only01(GOOD_PLAN.replace("**收口**\n\n- [x] 做好一轮：本片不需要：示例。\n- [x] 改动成员的合入检查：`npm run check` 退出 0\n- [x] 提交\n", "")), ["切片 01 缺「**收口**」"], "整个收口都没有时只报缺收口");
  assert.deepEqual(only01(GOOD_PLAN.replace("**开工包**\n\n- 上下文增量：无\n\n", "")), ["切片 01 缺「**开工包**」"]);
  assert.deepEqual(checkPlan(GOOD_PLAN.replace("### 02：第二片", "见 ### 02：第二片")).map((d) => d.message), ["切片表里的切片 02 没有自己的「### 02：」节"], "切片标题要在行首");
});

/** 交接信息包模板实例化：起点填一个提交号，人的验收窗口与预计收尾填时刻，切片大纲填一片，四问的占位换成答案。 */
const OUTLINE_ROW = "| 01 | 第一片 | C1 | 跑一次 demo | 10 | 2 小时 |";
const GOOD_HANDOFF = readFileSync(HANDOFF_TEMPLATE, "utf8").split("\n---\n").slice(1).join("\n---\n")
  .replace("- 起点：<分支>@<完整提交号>", "- 起点：main@0123abc").replace(/？<>$/gm, "？答。")
  .replace("回来 <UTC 时刻>", "回来 2026-11-08T18:00Z").replace("- 预计收尾：<UTC 时刻>", "- 预计收尾：2026-11-08T12:00Z")
  .replace("| 01 | <> | <> | <> | <> | <> |", OUTLINE_ROW);
const START_MESSAGE = "起点一行应为「- 起点：<分支>@<提交号>」，提交号至少 7 位十六进制；分支与提交号可各自带反引号，例如「- 起点：main@0123abc」";
const WINDOW_FORMAT = "人的验收窗口一行格式错：应为「- 人的验收窗口：回来 <UTC 时刻> · 验收 <分钟数> 分钟（<人的原话>）」";
const HANDOFF_ETA_FORMAT = "预计收尾一行格式错：应为「- 预计收尾：<UTC 时刻> · 依据：<切片大纲的预计用时之和>」";
const OUTLINE_EMPTY = "切片大纲没有写：每片一行，写交付的行为、对应验收、人怎么验、验几分钟、预计做多久";

test("交接信息包：模板实例化后通过，把模板与核对器钉在一起；没填的模板报起点、切片大纲、窗口、预计收尾与四问", () => {
  assert.deepEqual(checkHandoff(GOOD_HANDOFF).map((d) => d.message), []);
  assert.deepEqual(handoffHints(GOOD_HANDOFF), [], "新模板没有提示");
  const raw = readFileSync(HANDOFF_TEMPLATE, "utf8").split("\n---\n").slice(1).join("\n---\n");
  assert.deepEqual(checkHandoff(raw).map((d) => d.message), [OUTLINE_EMPTY, START_MESSAGE, WINDOW_FORMAT, HANDOFF_ETA_FORMAT, "四问第 1 条没有答案", "四问第 2 条没有答案", "四问第 3 条没有答案", "四问第 4 条没有答案"]);
  assert.ok(raw.split("\n").includes(OUTLINE_TABLE_HEADER), "模板的切片大纲带表头");
  assert.ok(raw.split("\n").some((l) => l.startsWith(HANDOFF_ETA_PREFIX)), "模板的起点与风险有预计收尾一行");
  const titles = sections(raw).map((s) => s.title).filter(Boolean);
  assert.deepEqual(titles, [...HANDOFF_SECTIONS.slice(0, 4), "切片大纲", ...HANDOFF_SECTIONS.slice(4)], "新模板在验收标准之后多切片大纲一节");
});

test("交接信息包新模板：缺切片大纲一节报缺节；表头不对、表里只有占位各报一处，行号指向那一节", () => {
  const lines = GOOD_HANDOFF.split("\n");
  const outlineAt = lines.indexOf("## 切片大纲") + 1;
  const noOutline = GOOD_HANDOFF.slice(0, GOOD_HANDOFF.indexOf("## 切片大纲")) + GOOD_HANDOFF.slice(GOOD_HANDOFF.indexOf("## 边界"));
  assert.deepEqual(checkHandoff(noOutline).map((d) => d.message), ["缺节「## 切片大纲」"]);
  assert.deepEqual(checkHandoff(GOOD_HANDOFF.replace(OUTLINE_TABLE_HEADER, "| 切片 | 行为 |")).map((d) => [d.line, d.message]), [[outlineAt, `切片大纲缺表：表头「${OUTLINE_TABLE_HEADER}」，每片一行`]]);
  assert.deepEqual(checkHandoff(GOOD_HANDOFF.replace(OUTLINE_ROW, "| 01 | <> | <> | <> | <> | <> |")).map((d) => [d.line, d.message]), [[outlineAt, OUTLINE_EMPTY]]);
  assert.deepEqual(checkHandoff(GOOD_HANDOFF.replace(OUTLINE_ROW, "| 01 | 第一片 | <> | <> | <> | <> |")), [], "有一格写了就算写了");
  const moved = GOOD_HANDOFF.replace("## 切片大纲\n", "## 临时\n").replace("## 边界\n", "## 切片大纲\n").replace("## 临时\n", "## 边界\n");
  assert.ok(checkHandoff(moved).some((d) => d.message === "节「## 边界」应在「## 切片大纲」之后"), "切片大纲在验收标准与边界之间");
});

test("交接信息包新模板：预计收尾晚于人回来的时刻，已定事项没有按一程做报一处，行号指向预计收尾一行；有就不报；窗口与预计收尾缺或格式错各报", () => {
  const late = GOOD_HANDOFF.replace("- 预计收尾：2026-11-08T12:00Z", "- 预计收尾：2026-11-08T20:00Z");
  const etaAt = (text) => text.split("\n").findIndex((l) => l.startsWith(HANDOFF_ETA_PREFIX)) + 1;
  const over = "预计收尾 2026-11-08T20:00Z 晚于人回来的时刻 2026-11-08T18:00Z：一程大过人验得完的量。定程时分程，这份包只装第一程；人说就按一程做时，在「已定事项」记一行「- 按一程做；人的原话：<>」";
  assert.deepEqual(checkHandoff(late).map((d) => [d.line, d.message]), [[etaAt(late), over]]);
  assert.deepEqual(checkHandoff(late.replace("## 已定事项\n\n", "## 已定事项\n\n- 按一程做；人的原话：就一程\n")), [], "人说按一程做");
  assert.deepEqual(checkHandoff(late.replace("## 目标\n\n", "## 目标\n\n按一程做。\n")).map((d) => d.message), [over], "已定事项之外的按一程做不算");
  const startAt = GOOD_HANDOFF.split("\n").indexOf("## 起点与风险") + 1;
  const noWindow = GOOD_HANDOFF.split("\n").filter((l) => !l.startsWith(WINDOW_LINE_PREFIX)).join("\n");
  assert.deepEqual(checkHandoff(noWindow).map((d) => [d.line, d.message]), [[startAt, "起点与风险缺人的验收窗口一行：加「- 人的验收窗口：回来 <UTC 时刻> · 验收 <分钟数> 分钟（<人的原话>）」"]]);
  assert.deepEqual(checkHandoff(GOOD_HANDOFF.replace("回来 2026-11-08T18:00Z", "回来 今晚")).map((d) => d.message), [WINDOW_FORMAT]);
  const badEta = GOOD_HANDOFF.replace("- 预计收尾：2026-11-08T12:00Z", "- 预计收尾：今晚");
  assert.deepEqual(checkHandoff(badEta).map((d) => [d.line, d.message]), [[etaAt(badEta), HANDOFF_ETA_FORMAT]]);
});

test("交接信息包旧模板（0.19.0 到 0.21.0）：没有预计收尾一行，缺切片大纲、窗口再晚都不报新缺陷，只给一条提示；命令面照样退出 0", () => {
  const old = (GOOD_HANDOFF.slice(0, GOOD_HANDOFF.indexOf("## 切片大纲")) + GOOD_HANDOFF.slice(GOOD_HANDOFF.indexOf("## 边界")))
    .split("\n").filter((l) => !l.startsWith(HANDOFF_ETA_PREFIX)).join("\n");
  assert.deepEqual(checkHandoff(old), []);
  const hint = "「起点与风险」没有「- 预计收尾：」一行，按旧模板核，切片大纲与尺寸只提示、不报缺陷。照交接信息包模板在「验收标准」之后加「## 切片大纲」，在「起点与风险」加预计收尾一行";
  assert.deepEqual(handoffHints(old).map((h) => [h.line, h.message]), [[old.split("\n").indexOf("## 起点与风险") + 1, hint]]);
  assert.deepEqual(hintFiles({ handoff: "h.md" }, () => old).map((h) => h.file), ["h.md"], "命令面给了包就带包的提示");
  const dir = mkdtempSync(join(tmpdir(), "pqw-check-plan-"));
  try {
    writeFileSync(join(dir, "handoff.md"), old);
    const text = run(["--handoff", join(dir, "handoff.md")]);
    assert.equal(text.status, 0, text.stdout);
    assert.ok(text.stdout.trimEnd().endsWith("check-plan：结构合模板，1 条提示"), text.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("交接信息包新模板：切片大纲里「人怎么验」写无的给一条提示，不报缺陷", () => {
  const none = GOOD_HANDOFF.replace(OUTLINE_ROW, "| 01 | 第一片 | C1 | 无 | 0 | 2 小时 |");
  assert.deepEqual(checkHandoff(none), []);
  assert.deepEqual(handoffHints(none).map((h) => [h.line, h.message]), [[none.split("\n").indexOf("| 01 | 第一片 | C1 | 无 | 0 | 2 小时 |") + 1, "切片 01 的「人怎么验」写的是无：人上手看不到这片的行为，它只是中间产物，考虑并进能看到的那一片"]]);
});

test("命令面：--handoff - 从标准输入读包，好包退出 0，坏包退出 1 并以「标准输入」为文件名；两个参数都用 - 是用法错误", () => {
  const ok = spawnSync("node", [SCRIPT, "--handoff", "-"], { encoding: "utf8", input: GOOD_HANDOFF });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(ok.stdout.trim(), "check-plan：结构合模板");
  const bad = spawnSync("node", [SCRIPT, "--handoff", "-", "--format", "json"], { encoding: "utf8", input: GOOD_HANDOFF.replace("main@0123abc", "main@最新") });
  assert.equal(bad.status, 1);
  assert.deepEqual(JSON.parse(bad.stdout).defects.map((d) => [d.file, d.message]), [["标准输入", START_MESSAGE]]);
  const both = spawnSync("node", [SCRIPT, "--plan", "-", "--handoff", "-"], { encoding: "utf8", input: GOOD_HANDOFF });
  assert.equal(both.status, 2);
  assert.match(both.stderr, /只有一个参数能用 - 从标准输入读/);
});

test("交接信息包的四种坏法各报对应缺陷，行号指到出事的那一行", () => {
  const lines = GOOD_HANDOFF.split("\n");
  const messages = (text) => checkHandoff(text, "h.md").map((d) => d.message);
  assert.deepEqual(messages(GOOD_HANDOFF.replace("## 边界\n", "## 范围\n")), ["缺节「## 边界」"]);
  assert.deepEqual(messages(GOOD_HANDOFF.slice(0, GOOD_HANDOFF.indexOf("## 四问"))), ["缺节「## 四问」"], "整节四问都没有时只报缺节");
  assert.ok(messages(GOOD_HANDOFF.replace("## 目标\n", "## 临时\n").replace("## 依据\n", "## 目标\n").replace("## 临时\n", "## 依据\n")).includes("节「## 依据」应在「## 目标」之后"), "节顺序错");
  assert.deepEqual(checkHandoff(GOOD_HANDOFF.replace("main@0123abc", "main@最新")).map((d) => [d.line, d.message]), [[lines.indexOf("## 起点与风险") + 1, "起点一行应为「- 起点：<分支>@<提交号>」，提交号至少 7 位十六进制；分支与提交号可各自带反引号，例如「- 起点：main@0123abc」"]]);
  assert.deepEqual(messages(GOOD_HANDOFF.replace("main@0123abc", "main@0123ab")), ["起点一行应为「- 起点：<分支>@<提交号>」，提交号至少 7 位十六进制；分支与提交号可各自带反引号，例如「- 起点：main@0123abc」"], "提交号少于 7 位");
  const third = lines.findIndex((l) => l.startsWith("3. "));
  assert.deepEqual(checkHandoff(lines.filter((_, i) => i !== third).join("\n")).map((d) => [d.line, d.message]), [[lines.indexOf("## 四问") + 1, "四问第 3 条没有答案"]], "缺一条时行号指到四问标题");
  assert.deepEqual(checkHandoff(lines.map((l, i) => (i === third ? l.replace("？答。", "？") : l)).join("\n")).map((d) => [d.line, d.message]), [[third + 1, "四问第 3 条没有答案"]], "有题没答时行号指到那一条");
  assert.deepEqual(messages(GOOD_HANDOFF.replace("# 交接信息包：", "# 包：")), ["抬头应为「# 交接信息包：<一程名>」"]);
  assert.deepEqual(messages(GOOD_HANDOFF.replace("# 交接信息包：", "x # 交接信息包：")), ["抬头应为「# 交接信息包：<一程名>」"], "抬头要在行首");
  const START = "起点一行应为「- 起点：<分支>@<提交号>」，提交号至少 7 位十六进制；分支与提交号可各自带反引号，例如「- 起点：main@0123abc」";
  assert.deepEqual(messages(GOOD_HANDOFF.replace("- 起点：main@0123abc", "- 起点：main@0123abc（最新）")), [START], "提交号后不跟别的");
  assert.deepEqual(messages(GOOD_HANDOFF.replace("- 起点：main@0123abc", "x - 起点：main@0123abc")), [START], "起点要在行首");
  assert.deepEqual(messages(GOOD_HANDOFF.replace("- 起点：main@0123abc", "- 起点：main@0123abc  ")), [], "行尾空白不算");
  assert.deepEqual(messages(lines.map((l, i) => (i === third ? l.replace("？答。", "？  ") : l)).join("\n")), ["四问第 3 条没有答案"], "只有空白也算没答");
  assert.deepEqual(messages(lines.map((l, i) => (i === third ? l.replace("？答。", "？要不要？要。") : l)).join("\n")), [], "答案里可以再有问号");
  assert.equal(checkHandoff(GOOD_HANDOFF.replace("main@0123abc", "main@最新"))[0].file, "handoff.md", "不给文件名时记 handoff.md");
});

test("交接信息包：整条答案是尖括号占位都算没答，答案里夹着尖括号不算占位", () => {
  const lines = GOOD_HANDOFF.split("\n");
  const third = lines.findIndex((l) => l.startsWith("3. "));
  const withAnswer = (answer) => checkHandoff(lines.map((l, i) => (i === third ? l.replace("？答。", `？${answer}`) : l)).join("\n")).map((d) => [d.line, d.message]);
  for (const placeholder of ["<待只读核对后填>", "<待补>", "  <待只读核对后填>  ", "<a b>"]) assert.deepEqual(withAnswer(placeholder), [[third + 1, "四问第 3 条没有答案"]], placeholder);
  for (const answer of ["见 <spec> 第 3 节", "<待补>，已核对", "<a>和<b>"]) assert.deepEqual(withAnswer(answer), [], answer);
});

test("交接信息包：起点一行容许分支与提交号各自带反引号，报错消息给出正确写法", () => {
  const messages = (start) => checkHandoff(GOOD_HANDOFF.replace("- 起点：main@0123abc", start)).map((d) => d.message);
  for (const start of ["- 起点：`main`@`0123abc`", "- 起点：`main`@0123abc", "- 起点：main@`0123abc`", "- 起点：`feat/x`@`0123abcdef`  "]) assert.deepEqual(messages(start), [], start);
  for (const start of ["- 起点：`main@0123abc", "- 起点：`main`@`0123ab`", "- 起点：`main @ 0123abc`", "- 起点：`main`@`0123abc`（最新）"]) {
    const [message] = messages(start);
    assert.match(message, /^起点一行应为「- 起点：<分支>@<提交号>」，提交号至少 7 位十六进制；分支与提交号可各自带反引号，例如「- 起点：main@0123abc」$/, start);
  }
});

test("checkFiles 给了哪几份就核哪几份，按 plan、spec、交接信息包的顺序", () => {
  const texts = { "p.md": GOOD_PLAN.replace("处置 2（", "处置 3（"), "s.md": GOOD_SPEC.replace("## Solution", "## 别的"), "h.md": GOOD_HANDOFF.replace("main@0123abc", "main@最新") };
  const read = (path) => texts[path];
  assert.deepEqual(checkFiles({}, read), []);
  assert.deepEqual(checkFiles({ handoff: "h.md" }, read).map((d) => d.file), ["h.md"]);
  assert.deepEqual([...new Set(checkFiles({ plan: "p.md", spec: "s.md", handoff: "h.md" }, read).map((d) => d.file))], ["p.md", "s.md", "h.md"]);
});

test("命令面：好文件退出 0 并说合模板；坏文件退出 1 逐条列「文件:行 缺陷」；--format json 结构稳定；缺 --plan 或读不到退出 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "pqw-check-plan-"));
  try {
    writeFileSync(join(dir, "plan.md"), GOOD_PLAN);
    writeFileSync(join(dir, "spec.md"), GOOD_SPEC);
    writeFileSync(join(dir, "bad.md"), GOOD_PLAN.replace("处置 2（", "处置 3（").replace("## 文档维护表", "## 别的表"));
    const ok = run(["--plan", join(dir, "plan.md"), "--spec", join(dir, "spec.md")]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(ok.stdout.trim(), "check-plan：结构合模板");
    const bad = run(["--plan", join(dir, "bad.md")]);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /^.*bad\.md 缺节「## 文档维护表」$/m);
    assert.match(bad.stdout, new RegExp(`^.*bad\\.md:${GOOD_PLAN.split("\n").findIndex((l) => l.startsWith("处置 2（")) + 1} 处置编号断号：应为 2，写的是 3$`, "m"));
    assert.match(bad.stdout, /\ncheck-plan：\d+ 处缺陷\n?$/);
    const json = JSON.parse(run(["--plan", join(dir, "bad.md"), "--format", "json"]).stdout);
    assert.equal(json.ok, false);
    assert.deepEqual(Object.keys(json.defects[0]).sort(), ["file", "line", "message"]);
    assert.equal(run([]).status, 2);
    const missingValue = run(["--plan", join(dir, "plan.md"), "--spec"]);
    assert.equal(missingValue.status, 2);
    assert.match(missingValue.stderr, /--spec 缺少值/);
    assert.equal(run(["--plan", join(dir, "nope.md")]).status, 2);
    assert.equal(run(["--help"]).status, 0);
    writeFileSync(join(dir, "handoff.md"), GOOD_HANDOFF);
    writeFileSync(join(dir, "bad-handoff.md"), GOOD_HANDOFF.replace("main@0123abc", "main@最新"));
    const handoff = run(["--handoff", join(dir, "handoff.md")]);
    assert.equal(handoff.status, 0, handoff.stderr);
    assert.equal(handoff.stdout.trim(), "check-plan：结构合模板");
    const badHandoff = run(["--handoff", join(dir, "bad-handoff.md"), "--format", "json"]);
    assert.equal(badHandoff.status, 1);
    assert.deepEqual(JSON.parse(badHandoff.stdout).defects.map((d) => d.message), ["起点一行应为「- 起点：<分支>@<提交号>」，提交号至少 7 位十六进制；分支与提交号可各自带反引号，例如「- 起点：main@0123abc」"]);
    assert.equal(run(["--plan", join(dir, "plan.md"), "--handoff", join(dir, "bad-handoff.md")]).status, 1, "与 --plan 同给时一起核");
    assert.equal(run(["--spec", join(dir, "spec.md")]).status, 2, "只给 --spec 仍是用法错误");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("预计收尾：进度总览要有「预计收尾：<UTC> · 依据：<一句>」，缺或格式错各报一处", () => {
  const messages = (text) => checkPlan(text).map((d) => d.message);
  assert.ok(messages(GOOD_PLAN.replace(/^预计收尾：.*\n/m, "")).some((m) => m.startsWith("进度总览缺预计收尾行")));
  assert.ok(messages(GOOD_PLAN.replace("预计收尾：2026-11-08T12:00Z · 依据：剩一片，预算 2 小时", "预计收尾：明天")).some((m) => m.startsWith("预计收尾行格式错")));
});

test("子代理表：状态以固定状态词开头，说明放在后面；「第 3/5 轮后因限流终止」这类写法报缺陷", () => {
  const withStatus = (s) => GOOD_PLAN.replace("| 第 2/4 轮 |  |", `| ${s} | 2 万 |`);
  for (const ok of ["进行中", "待验收", "已合回 0123abc", "已丢弃", "停下（第 3/5 轮后限流）", "已结束", "第 4/4 轮", "进行中：第二轮修复"]) assert.deepEqual(checkPlan(withStatus(ok)), [], ok);
  for (const bad of ["第 3/5 轮后因限流终止", "运行中", "终止", ""]) {
    const d = checkPlan(withStatus(bad));
    assert.deepEqual(d.map((x) => x.message), [`子代理「哨兵」的状态「${bad}」不以状态词开头：状态词是 进行中、待验收、已合回、已丢弃、停下、已结束、第 n/N 轮，说明写在后面的括号或冒号里`], bad);
    assert.equal(d[0].line, withStatus(bad).split("\n").findIndex((l) => l.startsWith("| 哨兵 |")) + 1);
  }
});

test("收口缺「改动成员的合入检查」报缺陷；勾没勾都算在", () => {
  const no = GOOD_PLAN.replace("- [ ] 改动成员的合入检查：\n", "");
  assert.deepEqual(checkPlan(no).map((d) => d.message), ["切片 02 收口缺「改动成员的合入检查」"]);
});

test("验收标准：每条写明经过的成员，路径要在责任分级里；落不进的写「按范围验收」", () => {
  const spec = (text) => checkSpec(text).map((d) => d.message);
  assert.deepEqual(spec(GOOD_SPEC.replace("。经过：`pkg/a/`、`pkg/b/x.ts`", "")), ["C1 没写经过的成员：在这条里写「经过：`<成员或目录>`」；它经过范围外的成员时改写「按范围验收：<范围内验到哪>；范围外部分归<谁>」"]);
  assert.deepEqual(spec(GOOD_SPEC.replace("`pkg/b/x.ts`", "`pkg/c/`")), ["C1 经过的 `pkg/c/` 不在责任分级里：本程改动带出的消费者就补进责任分级；否则这条写「按范围验收：<范围内验到哪>；范围外部分归<谁>」"]);
  assert.deepEqual(spec(GOOD_SPEC.replace("`pkg/b/x.ts`", "`pkg/ab/`")), ["C1 经过的 `pkg/ab/` 不在责任分级里：本程改动带出的消费者就补进责任分级；否则这条写「按范围验收：<范围内验到哪>；范围外部分归<谁>」"], "pkg/a 不盖 pkg/ab");
  assert.deepEqual(spec(GOOD_SPEC.replace("。经过：`pkg/a/`、`pkg/b/x.ts`", "。经过：`pkg/a/`、`pkg/c/`；按范围验收：pkg/a 内全部完成；范围外部分归 #2")), [], "写明按范围验收就不核范围外的路径");
  assert.deepEqual(spec(GOOD_SPEC.replace("。经过：`pkg/a/`、`pkg/b/x.ts`", "。按范围验收：只验 pkg/a")), [], "只写按范围验收也行");
  assert.deepEqual(spec(GOOD_SPEC.replace("。经过：`pkg/a/`、`pkg/b/x.ts`", "。经过：pkg/a")), ["C1 没写经过的成员：在这条里写「经过：`<成员或目录>`」；它经过范围外的成员时改写「按范围验收：<范围内验到哪>；范围外部分归<谁>」"], "路径要带反引号");
});

test("时刻不晚于检查时的时钟：plan 与 spec 里晚于现在的时刻报缺陷，预计收尾那一行除外", () => {
  const now = Date.parse("2026-11-08T10:30Z");
  assert.deepEqual(checkPlan(GOOD_PLAN, "plan.md", { now }), [], "预计收尾在将来不算");
  const late = GOOD_PLAN.replace("处置 2（2026-11-08T09:45Z）", "处置 2（2026-11-08T10:50Z）");
  assert.deepEqual(checkPlan(late, "plan.md", { now }).map((d) => [d.line, d.message]), [[late.split("\n").findIndex((l) => l.startsWith("处置 2")) + 1, "时刻 2026-11-08T10:50Z 晚于检查时的时钟 2026-11-08T10:30Z：时刻在写的那一刻读时钟，不估"]]);
  assert.deepEqual(checkPlan(GOOD_PLAN.replace("处置 2（2026-11-08T09:45Z）", "处置 2（2026-11-08T10:31Z）"), "plan.md", { now }), [], "一分钟以内不算");
  assert.deepEqual(checkSpec(GOOD_SPEC.replace("问题。", "问题，2026-11-09T00:00Z 发现。"), "spec.md", { now }).map((d) => d.message), ["时刻 2026-11-09T00:00Z 晚于检查时的时钟 2026-11-08T10:30Z：时刻在写的那一刻读时钟，不估"]);
  const dir = mkdtempSync(join(tmpdir(), "pqw-check-plan-now-"));
  try {
    writeFileSync(join(dir, "plan.md"), late);
    assert.equal(run(["--plan", join(dir, "plan.md"), "--now", "2026-11-08T10:30Z"]).status, 1, "命令面 --now 给定时钟");
    assert.equal(run(["--plan", join(dir, "plan.md"), "--now", "2026-11-08T11:00Z"]).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("经过的成员：只认「经过：」之后的反引号；续行只到空行或不缩进的行；./ 与结尾的 / 不影响；连带里的路径也算", () => {
  const spec = (text) => checkSpec(text).map((d) => d.message);
  assert.deepEqual(spec(GOOD_SPEC.replace("- C1 第一条。", "- C1 跑 `npm test` 退出 0。")), [], "经过之前的反引号是命令，不是成员");
  const para = GOOD_SPEC.replace("- C1 第一条。经过：`pkg/a/`、`pkg/b/x.ts`", "- C1 第一条").replace("  第二行说明。经过：`pkg/b2`\n", "  第二行说明。经过：`pkg/b2`\n\n说明段落里写了经过：`pkg/a/`\n");
  assert.deepEqual(spec(para), ["C1 没写经过的成员：在这条里写「经过：`<成员或目录>`」；它经过范围外的成员时改写「按范围验收：<范围内验到哪>；范围外部分归<谁>」"], "列表后面的段落不算进 C2");
  const blank = GOOD_SPEC.replace("- C2 第二条\n  第二行说明。", "- C2 第二条\n\n  第二行说明。");
  assert.deepEqual(spec(blank), ["C2 没写经过的成员：在这条里写「经过：`<成员或目录>`」；它经过范围外的成员时改写「按范围验收：<范围内验到哪>；范围外部分归<谁>」"], "空行结束一条");
  assert.deepEqual(spec(GOOD_SPEC.replace("`pkg/b/x.ts`", "`./pkg/b/x.ts`")), [], "开头的 ./ 去掉再比");
  assert.deepEqual(spec(GOOD_SPEC.replace("`pkg/b2`", "`pkg/b2/`")), [], "结尾的 / 去掉再比");
  assert.deepEqual(spec(GOOD_SPEC.replace("`pkg/b/x.ts`", "`docs/x.md`").replace("| 连带 | 无 | 无 |", "| 连带 | `docs/` | 回归 |")), [], "连带里的路径也在三级之内");
  const at = GOOD_SPEC.replace("。经过：`pkg/a/`、`pkg/b/x.ts`", "");
  assert.deepEqual(checkSpec(at).map((d) => d.line), [at.split("\n").findIndex((l) => l.startsWith("- C1")) + 1], "行号指向那一条");
});

test("新缺陷的行号：预计收尾格式错指向那一行，收口缺合入检查指向「**收口**」；收口之前的同名勾选项不算；子代理表在节末尾也照核", () => {
  const badEta = GOOD_PLAN.replace("预计收尾：2026-11-08T12:00Z · 依据：剩一片，预算 2 小时", "预计收尾：明天");
  assert.deepEqual(checkPlan(badEta).map((d) => d.line), [badEta.split("\n").indexOf("预计收尾：明天") + 1]);
  const no = GOOD_PLAN.replace("- [ ] 改动成员的合入检查：\n", "");
  const lines = no.split("\n");
  assert.deepEqual(checkPlan(no).map((d) => d.line), [lines.findIndex((l, i) => l.startsWith("**收口**") && i > lines.indexOf("### 02：第二片")) + 1]);
  // 开工包里多了一项就算填了；用旧模板，只看收口这一类缺陷。
  const before = OLD_PLAN.replace("**开工包**：开工时填。", "**开工包**：开工时填。\n\n- [ ] 改动成员的合入检查：写在开工包里").replace("- [ ] 改动成员的合入检查：\n- [ ] 提交", "- [ ] 提交");
  assert.deepEqual(checkPlan(before).map((d) => d.message), ["切片 02 收口缺「改动成员的合入检查」"]);
  const tail = GOOD_PLAN.replace("| 哨兵 | 哨兵，45 分钟，4 轮 | 理由二 | 便宜档 | 2026-11-08T08:00Z | 第 2/4 轮 |  |\n\n处置 1", "| 哨兵 | 哨兵，45 分钟，4 轮 | 理由二 | 便宜档 | 2026-11-08T08:00Z | 运行中 |  |\n\n处置 1");
  assert.notEqual(tail, GOOD_PLAN, "替换要命中子代理表的哨兵行");
  assert.deepEqual(checkPlan(tail.replace(/\n\n处置 1[^]*?\n\n## 一程目标/, "\n## 一程目标")).map((d) => d.message.split("：")[0]), ["子代理「哨兵」的状态「运行中」不以状态词开头"]);
});

test("checkFiles 把时钟传给 plan 与 spec 的核对", () => {
  const late = GOOD_PLAN.replace("处置 2（2026-11-08T09:45Z）", "处置 2（2026-11-08T10:50Z）");
  const lateSpec = GOOD_SPEC.replace("问题。", "问题，2026-11-08T10:50Z 发现。");
  const read = (p) => ({ plan: late, spec: lateSpec })[p];
  assert.equal(checkFiles({ plan: "plan", spec: "spec", now: Date.parse("2026-11-08T10:30Z") }, read).length, 2);
  assert.equal(checkFiles({ plan: "plan", spec: "spec", now: Date.parse("2026-11-08T11:00Z") }, read).length, 0);
});

/** GOOD_PLAN 是新模板：进度总览带「思维模型：」一行。去掉这一行就是旧模板。 */
const NEW_PLAN = GOOD_PLAN;
const OLD_PLAN = GOOD_PLAN.split("\n").filter((l) => !l.startsWith(MODELS_LINE_PREFIX)).join("\n");
/** 切片 02 的开工包：先填一栏别的，再按给的栏名各填一行。 */
const packOf = (fields) => ["**开工包**", "", "- 上下文增量：读 a.ts", ...fields.map((f) => `  - ${f}：答${f}`)].join("\n");
const withPack = (plan, fields) => plan.replace("**开工包**：开工时填。", packOf(fields));
const missing = (names) => names.map((n) => `切片 02 未收口、开工包已填，缺「${n}」一栏：按 plan 模板在开工包里补「${n}：」一行`);

test("开工包的思维模型栏：plan 模板里每一栏都在，核对器与模板是同一份契约", () => {
  assert.ok(readFileSync(TEMPLATE, "utf8").split("\n").some((l) => l.startsWith(MODELS_LINE_PREFIX)), "plan 模板的进度总览有「思维模型：」一行");
  const pack = readFileSync(TEMPLATE, "utf8").split("**开工包**")[1].split("**收口**")[0];
  for (const f of KICKOFF_FIELDS) assert.match(pack, new RegExp(`^\\s*(?:-|\\d+\\.) ${f}：`, "m"), `plan 模板的开工包缺「${f}：」一栏`);
});

test("开工包的思维模型栏：未收口且开工包已填的切片缺哪栏报哪栏；栏齐了、开工包没填、已完成或跳过的不报", () => {
  const messages = (text) => checkPlan(text).map((d) => d.message);
  assert.deepEqual(messages(NEW_PLAN), [], "开工包没填的切片不查");
  assert.deepEqual(messages(withPack(NEW_PLAN, [])), missing(KICKOFF_FIELDS), "填了别的栏、思维模型栏一栏没写，逐栏报");
  const complete = withPack(NEW_PLAN, KICKOFF_FIELDS);
  assert.deepEqual(messages(complete), [], "栏齐了通过");
  const [first, ...rest] = KICKOFF_FIELDS;
  assert.deepEqual(messages(withPack(NEW_PLAN, rest)), missing([first]), "少一栏报那一栏");
  assert.deepEqual(messages(complete.replace(`- ${first}：答${first}`, `- ${first}：<本片做完后应该成立什么>`)), missing([first]), "模板占位符不算答过");
  assert.deepEqual(messages(complete.replace(`- ${first}：答${first}`, `- ${first}：`)), missing([first]), "冒号后空着不算答过");
  const untouched = NEW_PLAN.replace("**开工包**：开工时填。", "**开工包**\n\n- 上下文增量：<本片额外需要的文件>\n- 技术细节设计与验证：<类型、签名>；关键位置：<路径>\n- 细化的推进方案：\n  - [ ] 做对：<完成判据>");
  assert.deepEqual(messages(untouched), [], "照抄模板没改的开工包算没填");
  const afterCloseout = withPack(NEW_PLAN, []).replace("- [ ] 提交", `- [ ] 提交\n${KICKOFF_FIELDS.map((f) => `  - ${f}：答${f}`).join("\n")}`);
  assert.deepEqual(messages(afterCloseout), missing(KICKOFF_FIELDS), "写在收口之后的不算开工包里的");
  for (const status of ["已完成 0123abc", "跳过（范围外）"]) assert.deepEqual(messages(withPack(NEW_PLAN, []).replace("| 02 | 第二片 | C2 | 待做 |", `| 02 | 第二片 | C2 | ${status} |`)), [], `${status} 的切片不查`);
  assert.deepEqual(messages(withPack(NEW_PLAN, []).replace("| 02 | 第二片 | C2 | 待做 |", "| 02 | 第二片 | C2 | 受阻（等人） |")), missing(KICKOFF_FIELDS), "受阻也是未收口");
});

test("旧模板：进度总览没有「思维模型：」一行时开工包的思维模型栏不报缺陷，只给一条提示；命令面照样退出 0", () => {
  const old = withPack(OLD_PLAN, []);
  assert.deepEqual(checkPlan(old), []);
  const hints = planHints(old);
  assert.equal(hints.length, 1);
  assert.equal(hints[0].line, OLD_PLAN.split("\n").indexOf("## 进度总览") + 1);
  assert.equal(hints[0].message, `进度总览没有「思维模型：」一行，按旧模板核，开工包的思维模型栏只提示、不报缺陷。照 plan 模板加上这一行，上下文压缩之后按它重新加载思维模型技能；加上之后要补：切片 02 缺${KICKOFF_FIELDS.map((f) => `「${f}」`).join("")}`);
  assert.equal(planHints(OLD_PLAN)[0].message.split("；")[0], hints[0].message.split("；")[0], "没有要补的切片时只说缺这一行");
  assert.ok(!planHints(OLD_PLAN)[0].message.includes("；加上之后"));
  assert.deepEqual(planHints(NEW_PLAN), [], "新模板没有提示");
  const dir = mkdtempSync(join(tmpdir(), "pqw-check-plan-"));
  try {
    writeFileSync(join(dir, "plan.md"), old);
    const text = run(["--plan", join(dir, "plan.md"), "--now", "2026-11-08T11:00Z"]);
    assert.equal(text.status, 0, text.stdout);
    assert.ok(text.stdout.includes(` 提示：${hints[0].message}`), text.stdout);
    assert.ok(text.stdout.trimEnd().endsWith("check-plan：结构合模板，1 条提示"), text.stdout);
    const json = run(["--plan", join(dir, "plan.md"), "--now", "2026-11-08T11:00Z", "--format", "json"]);
    assert.equal(json.status, 0);
    const parsed = JSON.parse(json.stdout);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.defects, []);
    assert.deepEqual(parsed.hints.map((h) => h.message), [hints[0].message]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/** 0.19.0 模板的 plan：有「思维模型：」一行，没有人的验收窗口一行。 */
const PLAN_019 = GOOD_PLAN.split("\n").filter((l) => !l.startsWith(WINDOW_LINE_PREFIX)).join("\n");
const LATE = (plan) => plan.replace("预计收尾：2026-11-08T12:00Z", "预计收尾：2026-11-08T20:00Z");
const windowLine = (plan) => plan.split("\n").findIndex((l) => l.startsWith(WINDOW_LINE_PREFIX)) + 1;
const OVER_WINDOW = "预计收尾 2026-11-08T20:00Z 晚于人回来的时刻 2026-11-08T18:00Z：滑出了人的验收窗口。按规则截程交付，在处置记录里记一行「处置 <n>（<UTC 时刻>）：截程交付；<交了哪几片，剩下的写进交付声明>」；交接信息包里人说过按一程做的，记一行「处置 <n>（<UTC 时刻>）：按一程做；人的原话：<>」";
const SPLIT = "\n## 分程建议\n\n| 程 | 目标 | 交付的行为 | 预计时长 | 人怎么验 |\n| --- | --- | --- | --- | --- |\n| 1 | 先交第一片 | 第一片 | 2 小时 | 跑一次 demo，十分钟 |\n";

test("人的验收窗口：plan 模板里有这一行，实例化后合格式，核对器与模板是同一份契约", () => {
  const line = instantiate(TEMPLATE).split("\n").find((l) => l.startsWith(WINDOW_LINE_PREFIX));
  assert.ok(line, "plan 模板的预算与回看有「人的验收窗口」一行");
  assert.match(line, WINDOW_RE);
  assert.ok(!readFileSync(TEMPLATE, "utf8").includes("\n## 分程建议\n"), "分程归交接期，plan 模板没有「分程建议」一节");
  assert.ok(readFileSync(TEMPLATE, "utf8").includes("- **人怎么验：**"), "plan 模板的切片有「人怎么验」一项");
});

test("人的验收窗口：预计收尾晚于人回来的时刻，没有截程交付或按一程做的处置、也没有旧模板的分程建议，报一处，行号指向窗口一行；有其一就不报", () => {
  assert.deepEqual(checkPlan(GOOD_PLAN), [], "预计收尾在窗口之内");
  const late = LATE(GOOD_PLAN);
  assert.deepEqual(checkPlan(late).map((d) => [d.line, d.message]), [[windowLine(late), OVER_WINDOW]]);
  assert.deepEqual(checkPlan(late.replace("处置 2（2026-11-08T09:45Z）：继续；无信号。", "处置 2（2026-11-08T09:45Z）：截程交付；交 01，02 写进交付声明")), [], "截程交付");
  assert.deepEqual(checkPlan(late + SPLIT), [], "0.21.0 及以前的 plan 写了分程建议，照样认");
  assert.deepEqual(checkPlan(late + SPLIT.replace("| 1 | 先交第一片 | 第一片 | 2 小时 | 跑一次 demo，十分钟 |", "| 1 | <> | <> | <> | <> |")).map((d) => d.message), [OVER_WINDOW], "照抄模板没改的分程建议不算");
  assert.deepEqual(checkPlan(late.replace("处置 2（2026-11-08T09:45Z）：继续；无信号。", "处置 2（2026-11-08T09:45Z）：按一程做；人的原话：就按一程做")), [], "人说按一程做");
  assert.deepEqual(checkPlan(late.replace("- 预算 1 小时。", "- 预算 1 小时。按一程做。")).map((d) => d.message), [OVER_WINDOW], "处置行之外的「按一程做」不算");
  assert.deepEqual(checkPlan(GOOD_PLAN.replace("回来 2026-11-08T18:00Z", "回来 今晚")).map((d) => [d.line, d.message]), [[windowLine(GOOD_PLAN), "人的验收窗口一行格式错：应为「- 人的验收窗口：回来 <UTC 时刻> · 验收 <分钟数> 分钟（<人的原话>）」"]]);
  assert.deepEqual(checkPlan(GOOD_PLAN, "plan.md", { now: Date.parse("2026-11-08T10:30Z") }), [], "回来的时刻在将来不算晚于时钟");
});

test("0.19.0 模板的 plan：没有人的验收窗口一行，预计收尾再晚也不报新缺陷，只给一条提示；命令面照样退出 0", () => {
  assert.deepEqual(checkPlan(LATE(PLAN_019)), []);
  const hints = planHints(LATE(PLAN_019));
  assert.deepEqual(hints.map((h) => [h.line, h.message]), [[PLAN_019.split("\n").indexOf("## 预算与回看") + 1, "「预算与回看」没有「- 人的验收窗口：」一行，按旧模板核，预计收尾对人的验收窗口只提示、不报缺陷。照 plan 模板加上这一行，写人什么时候回来、有多少时间上手验收"]]);
  const dir = mkdtempSync(join(tmpdir(), "pqw-check-plan-"));
  try {
    writeFileSync(join(dir, "plan.md"), LATE(PLAN_019));
    const text = run(["--plan", join(dir, "plan.md"), "--now", "2026-11-08T11:00Z"]);
    assert.equal(text.status, 0, text.stdout);
    assert.ok(text.stdout.trimEnd().endsWith("check-plan：结构合模板，1 条提示"), text.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("人怎么验：新模板里切片写「无」给一条提示，不报缺陷；写了办法的、旧模板的不提示", () => {
  const none = GOOD_PLAN.replace("### 02：第二片\n\n- **交付：** 一句。", "### 02：第二片\n\n- **交付：** 一句。\n- **人怎么验：** 无");
  assert.deepEqual(checkPlan(none), []);
  assert.deepEqual(planHints(none).map((h) => [h.line, h.message]), [[none.split("\n").indexOf("- **人怎么验：** 无") + 1, "切片 02 的「人怎么验」写的是无：人上手看不到这片的行为，它只是中间产物，考虑并进能看到的那一片"]]);
  assert.deepEqual(planHints(none.replace("- **人怎么验：** 无", "- **人怎么验：** 无需命令，打开页面看；约 5 分钟")), [], "「无需」不是无");
  assert.deepEqual(planHints(none.split("\n").filter((l) => !l.startsWith(WINDOW_LINE_PREFIX)).join("\n")).length, 1, "旧模板只提示缺窗口一行");
});

/** 0.20.0 模板的 plan：子代理表没有 token 一列，思维模型一行没有 think-closed-loop，也没有 0.26.0 才有的 think-unknowns。 */
const PLAN_020 = GOOD_PLAN.replace(" · 转手 `think-closed-loop` · 问 `think-unknowns`", "")
  .replace("| 状态 | token |\n| --- | --- | --- | --- | --- | --- | --- |", "| 状态 |\n| --- | --- | --- | --- | --- | --- |")
  .replace("| 已合回 0123abc | 43 万 |", "| 已合回 0123abc |").replace("| 第 2/4 轮 |  |", "| 第 2/4 轮 |");
const TOKEN_HINT = "子代理表没有「token」一列，按旧模板核，token 只提示、不报缺陷。照 plan 模板在表的最后加这一列，数从完成通知里抄";
const modelsHint = (names) => `进度总览的「思维模型：」一行没有${names.map((n) => `\`${n}\``).join("、")}，按旧模板核，只提示、不报缺陷。照 plan 模板补上，上下文压缩之后按这一行重新加载`;

test("子代理表的 token 一列与思维模型一行的技能名：plan 模板里都在，核对器与模板是同一份契约", () => {
  const template = readFileSync(TEMPLATE, "utf8");
  const header = template.split("\n").find((l) => l.startsWith("| 子代理 | 用途 |"));
  assert.ok(header, "plan 模板有子代理表");
  assert.ok(header.trim().endsWith(`| 状态 | ${TOKEN_COLUMN} |`), `token 一列在最后、状态之后，哨兵按位置读状态不受影响：${header}`);
  const models = template.split("\n").find((l) => l.startsWith(MODELS_LINE_PREFIX));
  for (const name of MODEL_SKILLS) assert.ok(models.includes(`\`${name}\``), `plan 模板的思维模型一行缺 ${name}`);
  assert.ok(MODEL_SKILLS.includes("think-closed-loop") && MODEL_SKILLS.includes("candid-friend"));
  assert.deepEqual(planHints(instantiate(TEMPLATE)).map((h) => h.message).filter((m) => m.includes("token") || m.includes("思维模型")), [], "模板实例化后没有这两类提示");
});

test("token：新模板里状态是已合回或已结束的行，token 不能空，占位不算；进行中、第 n/N 轮的行可以空；行号指向那一行", () => {
  assert.deepEqual(checkPlan(GOOD_PLAN), []);
  const noToken = GOOD_PLAN.replace("| 已合回 0123abc | 43 万 |", "| 已合回 0123abc |  |");
  const row = (text, name) => text.split("\n").findIndex((l) => l.startsWith(`| ${name} |`)) + 1;
  assert.deepEqual(checkPlan(noToken).map((d) => [d.line, d.message]), [[row(noToken, "写者"), "子代理「写者」状态是「已合回 0123abc」，token 一格是空的：从完成通知里抄这个子代理用了多少 token"]]);
  assert.deepEqual(checkPlan(noToken.replace("| 已合回 0123abc |  |", "| 已合回 0123abc | <token> |")).map((d) => d.message.split("，")[0]), ["子代理「写者」状态是「已合回 0123abc」"]);
  const ended = GOOD_PLAN.replace("| 第 2/4 轮 |  |", "| 已结束 |  |");
  assert.deepEqual(checkPlan(ended).map((d) => d.message), ["子代理「哨兵」状态是「已结束」，token 一格是空的：从完成通知里抄这个子代理用了多少 token"]);
  for (const s of ["进行中", "待验收", "已丢弃", "停下（限流）"]) assert.deepEqual(checkPlan(GOOD_PLAN.replace("| 第 2/4 轮 |  |", `| ${s} |  |`)), [], s);
});

test("子代理表按表头名取状态与 token：列换了顺序照样核", () => {
  const swapped = GOOD_PLAN.replace("| 开始 | 状态 | token |", "| 开始 | token | 状态 |")
    .replace("| 已合回 0123abc | 43 万 |", "| 43 万 | 已合回 0123abc |").replace("| 第 2/4 轮 |  |", "|  | 运行中 |");
  assert.deepEqual(checkPlan(swapped).map((d) => d.message.split("：")[0]), ["子代理「哨兵」的状态「运行中」不以状态词开头"]);
});

test("0.20.0 模板的 plan：没有 token 一列、思维模型一行没有闭环，不报新缺陷，只给两条提示；0.19.0 的再多一个名字；命令面照样退出 0", () => {
  assert.deepEqual(checkPlan(PLAN_020), []);
  assert.notEqual(PLAN_020.includes(TOKEN_COLUMN), true, "PLAN_020 的子代理表没有 token 一列");
  assert.deepEqual(planHints(PLAN_020).map((h) => h.message), [modelsHint(["think-closed-loop", "think-unknowns"]), TOKEN_HINT]);
  const plan019 = PLAN_020.replace(" · 对人 `candid-friend`", "");
  assert.deepEqual(planHints(plan019).map((h) => h.message), [modelsHint(["think-closed-loop", "think-unknowns", "candid-friend"]), TOKEN_HINT]);
  assert.deepEqual(planHints(GOOD_PLAN.replace(" · 问 `think-unknowns`", "")).map((h) => h.message), [modelsHint(["think-unknowns"])], "0.25 模板的 plan 只少不知为不知");
  assert.equal(planHints(PLAN_020)[0].line, PLAN_020.split("\n").findIndex((l) => l.startsWith(MODELS_LINE_PREFIX)) + 1);
  assert.equal(planHints(PLAN_020)[1].line, PLAN_020.split("\n").findIndex((l) => l.startsWith("| 子代理 | 用途 |")) + 1);
  assert.deepEqual(planHints(PLAN_020.replace(/\n\| 子代理 \| 用途 [^]*?\n\n/, "\n\n")).map((h) => h.message), [modelsHint(["think-closed-loop", "think-unknowns"])], "没有子代理表就不提 token");
  const dir = mkdtempSync(join(tmpdir(), "pqw-check-plan-"));
  try {
    writeFileSync(join(dir, "plan.md"), PLAN_020);
    const text = run(["--plan", join(dir, "plan.md"), "--now", "2026-11-08T11:00Z"]);
    assert.equal(text.status, 0, text.stdout);
    assert.ok(text.stdout.trimEnd().endsWith("check-plan：结构合模板，2 条提示"), text.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
