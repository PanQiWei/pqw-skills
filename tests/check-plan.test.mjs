// check-plan：按模板核 plan 与 spec 的骨架。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkPlan, checkSpec, sections, PLAN_SECTIONS, SPEC_SECTIONS } from "../skills/spec-and-plan/scripts/lib/check-plan.mjs";

const SCRIPT = new URL("../skills/spec-and-plan/scripts/check-plan.mjs", import.meta.url).pathname;
const TEMPLATE = new URL("../skills/spec-and-plan/plan-template.md", import.meta.url).pathname;
const SPEC_TEMPLATE = new URL("../skills/spec-and-plan/spec-template.md", import.meta.url).pathname;

/** 模板正文（分隔线之后），把三个机读占位符换成合法值。 */
const instantiate = (path) => readFileSync(path, "utf8").split("\n---\n").slice(1).join("\n---\n")
  .replaceAll("<UTC 时间>", "2026-11-08T10:00Z").replaceAll("<UTC 时刻>", "2026-11-08T10:00Z").replaceAll("<短 sha>", "0123abc").replaceAll("<N>", "1").replaceAll("<r>", "1");

const GOOD_PLAN = `# 示例 交付计划（revision 1）

## 进度总览

进度：[■■■■■□□□□□] 1/2 切片已完成 · 更新 2026-11-08T10:00Z · head 0123abc
当前：切片 02 开工包

| 切片 | 交付的行为 | 对应验收 | 状态 |
| --- | --- | --- | --- |
| 01 | 第一片 | C1 | 已完成 0123abc |
| 02 | 第二片 | C2 | 待做 |

处置 1（2026-11-08T09:00Z）：继续；无信号。
处置 2（2026-11-08T09:45Z）：继续；无信号。

## 一程目标与前后差别

### 产品层：用的人得到什么

一段话。

### 技术层：哪一块变了

一段话。

## 预算与回看

- 预算 1 小时。

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

- [x] 提交

### 02：第二片

- **交付：** 一句。
- **交付这片的意义：** 对用户，能看到；对系统，改了。

**开工包**：开工时填。

**收口**

- [ ] 提交

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

- C1 第一条
- C2 第二条

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
  assert.deepEqual(PLAN_SECTIONS.length, 7);
  assert.deepEqual(SPEC_SECTIONS.length, 9);
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
  assert.ok(spec(GOOD_SPEC.replace("- C1 第一条\n- C2 第二条", "- 第一条")).includes("验收标准里没有「- C<n>」条目"));
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
    assert.match(bad.stdout, /^.*bad\.md:14 处置编号断号：应为 2，写的是 3$/m);
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
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
