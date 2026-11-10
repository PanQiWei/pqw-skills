// 哨兵脚本：唤醒一次写汇报；增量摘要列提交、改动统计与新交回件；信号：停滞、可能兜圈、主代理连续两轮无处置、圈外改动、责任分级缺失。
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, writeFiles, dispose, git } from "./fixture.mjs";

const SCRIPT = new URL("../skills/one-lesson-rule/scripts/sentinel.mjs", import.meta.url).pathname;

const PLAN = `# 计划

## 进度总览

进度：[■□□□] 1/4 切片已完成 · 更新 T · head abc
当前：切片 02 实施

| 切片 | 交付的行为 | 对应验收 | 状态 |
| --- | --- | --- | --- |
| 01 | a | C1 | 已完成 abc |
| 02 | b | C2 | 进行中（x） |

| 子代理 | 用途 | 派发理由（派发门三条之一） | 模型与档位 | 开始 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 哨兵 | 哨兵，45 分钟，4 轮 | 理由二 | 便宜档 | ${new Date().toISOString()} | 第 1/4 轮 |

- [x] 里程碑一：做完
- [ ] 里程碑二：没做
`;

/** 带责任分级的 spec：列出的路径之外的改动算圈外改动。 */
const SPEC = (...paths) => `# 示例 实施规格（revision 1）

## 责任分级

| 级别 | 成员与路径（反引号括起，可多个） | 本程对它做什么 |
| --- | --- | --- |
| 重点 | ${paths.slice(0, 1).map((p) => `\`${p}\``).join("、")} | 兑现 C1 |
| 次要 | ${paths.slice(1).map((p) => `\`${p}\``).join("、") || "无"} | 同步消费者 |
| 连带 | 无 | 无 |

## Out of Scope

- 无
`;

const wake = (dir, out) => {
  const r = spawnSync("node", [SCRIPT, "--plan", join(dir, "tmp/run-x/plan.md"), "--out", out, "--once"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return readFileSync(join(out, "latest.md"), "utf8");
};

test("--help 退出 0；缺 --plan 退出 2；读不到 plan 退出 1", () => {
  assert.equal(spawnSync("node", [SCRIPT, "--help"], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync("node", [SCRIPT, "--once"], { encoding: "utf8" }).status, 2);
  assert.equal(spawnSync("node", [SCRIPT, "--plan", "/nonexistent/plan.md", "--once", "--out", "/tmp/pqw-sentinel-none"], { encoding: "utf8" }).status, 1);
});

test("唤醒一次：进度、切片表、里程碑计数、在跑的子代理、增量摘要；第二次列出新提交与新交回件；第三次停滞与两轮无处置", () => {
  const dir = makeRepo({ "README.md": "x\n", ".gitignore": "tmp/\n" });
  const out = join(dir, "tmp/run-x/sentinel");
  try {
    writeFiles(dir, { "tmp/run-x/plan.md": PLAN, "tmp/run-x/spec.md": SPEC("src/") });
    const first = wake(dir, out);
    assert.match(first, /第 1 次唤醒；上次 无/);
    assert.match(first, /进度：\[■□□□\] 1\/4 切片已完成/);
    assert.match(first, /\| 02 \| 进行中（x） \|/);
    assert.match(first, /里程碑：1\/2 已勾/);
    assert.match(first, /- 哨兵：哨兵，45 分钟，4 轮，开始 20\d\d-/);
    assert.match(first, /## 增量摘要\n\n- 上次唤醒以来提交 1 条/);
    assert.match(first, /- 处置记录：0 条\n/);
    assert.match(first, /- 无异常信号/);

    writeFiles(dir, { "src/a.ts": "export const a = 1;\n" });
    git(dir, "add src");
    git(dir, 'commit -q -m "feat: 加 a"');
    mkdirSync(join(dir, "tmp/run-x/artifacts"), { recursive: true });
    writeFileSync(join(dir, "tmp/run-x/artifacts/metrics-s02.json"), "{}\n");
    const second = wake(dir, out);
    assert.match(second, /第 2 次唤醒；上次 20/);
    assert.match(second, /- 上次唤醒以来提交 1 条\n```\n[0-9a-f]+ feat: 加 a\n```/);
    assert.match(second, /- 新出现的交回件：\n  - artifacts\/metrics-s02\.json\n/);
    assert.match(second, /- 可能兜圈：有提交但「当前」行没变/);
    assert.doesNotMatch(second, /停滞/);
    assert.doesNotMatch(second, /连续 \d+ 轮没有写处置/);
    assert.match(second, /- 未提交改动：无\n/);

    const third = wake(dir, out);
    assert.match(third, /- 停滞：上次唤醒以来没有新提交，工作树也没变/);
    assert.match(third, /- 主代理连续 2 轮没有写处置：plan 里仍是 0 条/);
    assert.match(third, /- 处置记录：0 条；连续 2 轮没有新增/);

    writeFiles(dir, { "tmp/run-x/plan.md": PLAN + "\n处置 1（2026-11-08T04:00Z）：继续；无信号\n" });
    const fourth = wake(dir, out);
    assert.match(fourth, /- 处置记录：1 条\n/);
    assert.doesNotMatch(fourth, /没有写处置/);
    assert.ok(existsSync(join(out, "state.json")));
    assert.equal(JSON.parse(readFileSync(join(out, "state.json"), "utf8")).n, 4);
  } finally { dispose(dir); }
});

// 文档陈旧信号（第六程 C4）。模板格式的 plan 才核结构。
const TEMPLATE_PLAN = (head, updated, extra = "", findings = "") => `# 示例 交付计划（revision 1）

## 进度总览

进度：[■■■■■□□□□□] 1/2 切片已完成 · 更新 ${updated} · head ${head}
当前：切片 02 实施

| 切片 | 交付的行为 | 对应验收 | 状态 |
| --- | --- | --- | --- |
| 01 | a | C1 | 已完成 ${head} |
| 02 | b | C2 | 进行中（x） |

## 一程目标与前后差别

### 产品层：得到什么

一段。

### 技术层：变了什么

一段。

## 预算与回看

- 预算。
${extra}
## 文档维护表

| 文档 | 给谁看 | 什么时候更新 | 只动哪一节 | 怎么判断过期 | 最近更新 |
| --- | --- | --- | --- | --- | --- |
| \`docs/a.md\` | 人 | 改行为时 | 一节 | 提交改了它 | 2026-11-08T09:00Z |
| \`docs/b.md\` | 人 | 改行为时 | 一节 | 提交改了它 | 未生成 |
| \`docs/c.md\` | 人 | 改行为时 | 一节 | 提交改了它 | 2026-11-08T10:00Z |
| 待裁清单 | 人 | 收口后 | 只追加 | 早于提交 | 2026-11-08T09:00Z |
| 汇报件 | 人 | 收口后 | 整份重生成 | 早于提交 | 未生成 |

## 切片

### 01：a

- **交付：** a。
- **交付这片的意义：** 对用户，x；对系统，y。

**开工包**

- 无

**收口**

- [x] 做好一轮：不需要；提交

### 02：b

- **交付：** b。
- **交付这片的意义：** 对用户，x；对系统，y。

**开工包**

- 无

**收口**

- [ ] 做好一轮：；提交

## 圈外发现

| 时刻 | 位置 | 现象 | 证据 | 挡住的验收（无或编号） | 处置（记录 / 绕法 / 停切片 NN） |
| --- | --- | --- | --- | --- | --- |
${findings}
## 顺序与并行

- 01 → 02

## 一程交付声明

- [ ] 五项
`;

test("文档陈旧：进度行 head 不是 HEAD、处置断号、汇报件早于最近提交、维护表落后而提交改了它，各出一条带证据的信号；结构合模板写进「文档」节", () => {
  const dir = makeRepo({ "README.md": "x\n", "docs/a.md": "a\n", ".gitignore": "tmp/\n" });
  const out = join(dir, "tmp/run-y/artifacts/sentinel");
  try {
    const head = git(dir, "rev-parse --short HEAD");
    // 汇报件先生成（旧时刻），再提交一次改 docs/a.md，于是汇报件早于最近提交、维护表里 docs/a.md 的时刻也落后。
    mkdirSync(join(dir, "tmp/run-y/artifacts"), { recursive: true });
    writeFileSync(join(dir, "tmp/run-y/artifacts/report.html"), "<html></html>\n");
    const old = new Date(Date.now() - 3600_000);
    utimesSync(join(dir, "tmp/run-y/artifacts/report.html"), old, old);
    writeFiles(dir, { "docs/a.md": "a2\n", "docs/b.md": "b\n", "docs/c.md": "c\n" });
    git(dir, "add docs");
    git(dir, 'commit -q -m "docs: 改 a"');
    const newHead = git(dir, "rev-parse --short HEAD");
    writeFiles(dir, { "tmp/run-y/spec.md": SPEC("docs/"), "tmp/run-y/plan.md": TEMPLATE_PLAN(head, "2026-11-08T10:00Z", "\n处置 1（2026-11-08T09:00Z）：继续；无\n处置 3（2026-11-08T09:45Z）：继续；无\n\n- [x] 额外里程碑：做完\n- [x] 再一个：做完\n") });
    const r = spawnSync("node", [SCRIPT, "--plan", join(dir, "tmp/run-y/plan.md"), "--out", out, "--once"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const report = readFileSync(join(out, "latest.md"), "utf8");
    assert.match(report, new RegExp(`- 文档陈旧：plan 进度行写的 head ${head} 不是当前 HEAD ${newHead}`));
    assert.doesNotMatch(report, /- 文档陈旧：处置编号断号/, "check-plan 已把断号列为结构缺陷，不再重复报（第七程 C5）");
    assert.match(report, /- 文档陈旧：汇报件 report\.html 生成于 20\d\d-.*，早于最近提交 20\d\d-/);
    assert.match(report, new RegExp(`- 文档陈旧：维护表里 docs/a\\.md 最近更新 2026-11-08T09:00Z 早于进度行更新 2026-11-08T10:00:00\\.000Z，而最近提交 ${newHead} 改了它`));
    assert.match(report, /## 文档\n\n- check-plan：1 处缺陷\n  - .*plan\.md:\d+ 处置编号断号：应为 2，写的是 3\n- 维护表：5 行\n/, "处置断号作为结构缺陷只报一处");
    assert.equal((report.match(/文档陈旧：维护表里/g) ?? []).length, 1, "时刻没法解析、等于进度行时刻、没有路径的行都不报");
    assert.match(report, /里程碑：3\/5 已勾/);
    assert.match(report, /- 文档陈旧：plan 结构不合模板，1 处缺陷（处置编号断号：应为 2，写的是 3）/);
    assert.match(r.stdout, /信号：文档陈旧：plan 进度行写的 head/);
    assert.doesNotMatch(r.stdout, /处置编号断号，应为/);
  } finally { dispose(dir); }
});

test("文档陈旧：结构不合模板出一条信号并在「文档」节列缺陷；不是模板格式的 plan 不核结构；找不到 check-plan 写未核结构，都不算信号", () => {
  const dir = makeRepo({ "README.md": "x\n" });
  const out = join(dir, "tmp/run-z/sentinel");
  try {
    const head = git(dir, "rev-parse --short HEAD");
    const broken = TEMPLATE_PLAN(head, "2026-11-08T10:00Z").replace("## 文档维护表", "## 别的表");
    writeFiles(dir, { "tmp/run-z/plan.md": broken });
    const r = spawnSync("node", [SCRIPT, "--plan", join(dir, "tmp/run-z/plan.md"), "--out", out, "--once"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const report = readFileSync(join(out, "latest.md"), "utf8");
    assert.match(report, /- 文档陈旧：plan 结构不合模板，1 处缺陷（缺节「## 文档维护表」）/);
    assert.match(report, /## 文档\n\n- check-plan：1 处缺陷\n  - .*plan\.md 缺节「## 文档维护表」\n/);
    assert.doesNotMatch(report, /进度行写的 head/);

    writeFiles(dir, { "tmp/run-z/plan.md": PLAN.replace(/^进度：.*\n/m, "").replace(/^当前：.*\n/m, "") });
    const plain = spawnSync("node", [SCRIPT, "--plan", join(dir, "tmp/run-z/plan.md"), "--out", out, "--once"], { encoding: "utf8" });
    const plainReport = readFileSync(join(out, "latest.md"), "utf8");
    assert.equal(plain.status, 0);
    assert.match(plainReport, /- 未核结构：plan 抬头不是模板格式/);
    assert.match(plainReport, /（没有进度行）\n（没有当前行）/, "没有进度行与当前行时写明，不崩");
    assert.doesNotMatch(plainReport, /- 文档陈旧/);

    writeFiles(dir, { "tmp/run-z/plan.md": TEMPLATE_PLAN(head, "2026-11-08T10:00Z", "\n处置 1（2026-11-08T09:00Z）：继续；无\n处置 3（2026-11-08T09:45Z）：继续；无\n") });
    const missing = spawnSync("node", [SCRIPT, "--plan", join(dir, "tmp/run-z/plan.md"), "--out", out, "--once"], { encoding: "utf8", env: { ...process.env, PQW_CHECK_PLAN: join(dir, "nope.mjs") } });
    assert.equal(missing.status, 0, missing.stderr);
    const missingReport = readFileSync(join(out, "latest.md"), "utf8");
    assert.match(missingReport, /- 未核结构：找不到 check-plan（.*nope\.mjs）/);
    assert.match(missingReport, /- 文档陈旧：处置编号断号，应为 2 却是 3/, "没核结构时断号由哨兵自己报");
    assert.equal((missingReport.match(/- 文档陈旧/g) ?? []).length, 1);
  } finally { dispose(dir); }
});

// 圈外改动与圈外发现（责任分级接通到底）。plan 与 spec 放在不被忽略的目录，才能核它们自身的改动不算。
const runWake = (dir, out, extra = []) => {
  const r = spawnSync("node", [SCRIPT, "--plan", join(dir, "run/plan.md"), "--out", out, "--once", ...extra], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return { report: readFileSync(join(out, "latest.md"), "utf8"), stdout: r.stdout };
};
const FINDING = (place, blocks) => `| 2026-11-08T10:00Z | ${place} | 现象 | 证据 | ${blocks} | 记录 |\n`;

test("圈外改动：提交里落在责任分级路径之外的文件列为信号，路径内的、plan 与 spec 自身、Git 忽略的都不算；未提交改动也算", () => {
  const dir = makeRepo({ "README.md": "x\n", ".gitignore": "out/\nbuild/\n" });
  const out = join(dir, "out/sentinel");
  try {
    const head = git(dir, "rev-parse --short HEAD");
    writeFiles(dir, { "run/spec.md": SPEC("pkg/a/", "pkg/b"), "run/plan.md": TEMPLATE_PLAN(head, "2026-11-08T10:00Z") });
    git(dir, "add run");
    git(dir, 'commit -q -m "docs: spec 与 plan"');
    const first = runWake(dir, out).report;
    assert.doesNotMatch(first, /^- 圈外改动/m, "第一次唤醒没有上次的 head，只看未提交改动；这里没有");
    assert.doesNotMatch(first, /^- 责任分级缺失/m);

    writeFiles(dir, { "pkg/a/x.ts": "1\n", "pkg/c/y.ts": "1\n", "run/plan.md": TEMPLATE_PLAN(head, "2026-11-08T10:05Z"), "run/spec.md": SPEC("pkg/a/", "pkg/b") + "\n改了\n" });
    git(dir, "add -A");
    git(dir, 'commit -q -m "feat: 改 a 也改 c"');
    writeFiles(dir, { "build/out.js": "忽略的\n" });
    const second = runWake(dir, out);
    assert.match(second.report, /^- 圈外改动：pkg\/c\/y\.ts$/m, "只列 pkg/c/y.ts：pkg/a/x.ts 在路径内，plan 与 spec 自身、Git 忽略的不算");
    assert.match(second.stdout, /^信号：圈外改动：pkg\/c\/y\.ts$/m);

    writeFiles(dir, { "pkg/ab/z.ts": "1\n", "pkg/b": "单个文件也是路径\n", "pkg/b2/w.ts": "1\n" });
    git(dir, "add -A");
    git(dir, 'commit -q -m "feat: 前缀"');
    assert.match(runWake(dir, out).report, /^- 圈外改动：pkg\/ab\/z\.ts、pkg\/b2\/w\.ts$/m, "按目录前缀比：pkg/a 不盖 pkg/ab/，pkg/b 盖住同名文件、不盖 pkg/b2/；上一轮的提交不再列");

    const third = runWake(dir, out).report;
    assert.doesNotMatch(third, /^- 圈外改动/m, "上次唤醒以来没有新提交、工作树没变");

    writeFiles(dir, { "pkg/d/new.ts": "1\n", "README.md": "y\n" });
    const fourth = runWake(dir, out).report;
    assert.match(fourth, /^- 圈外改动：README\.md、pkg\/d\/new\.ts$/m, "未跟踪与未暂存的改动都算");

    writeFiles(dir, Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`z/f${String(i).padStart(2, "0")}.ts`, "1\n"])));
    const many = runWake(dir, out).report;
    assert.match(many, /^- 圈外改动：README\.md、pkg\/d\/new\.ts、z\/f00\.ts、.*、z\/f07\.ts（共 14 个，只列前 10 个）$/m);
  } finally { dispose(dir); }
});

test("责任分级缺失：spec 读不到、没有这一节、表里没有路径时出信号，不算圈外改动；--spec 不给时取 plan 同目录的 spec.md", () => {
  const dir = makeRepo({ "README.md": "x\n", ".gitignore": "out/\n" });
  const out = join(dir, "out/sentinel");
  try {
    const head = git(dir, "rev-parse --short HEAD");
    writeFiles(dir, { "run/plan.md": TEMPLATE_PLAN(head, "2026-11-08T10:00Z"), "pkg/c/y.ts": "1\n" });
    const missing = runWake(dir, out).report;
    assert.match(missing, new RegExp(`^- 责任分级缺失：读不到 spec .*run/spec\\.md$`, "m"));
    assert.doesNotMatch(missing, /^- 圈外改动/m);

    writeFiles(dir, { "run/spec.md": "# 示例 实施规格（revision 1）\n\n## Out of Scope\n\n- 无\n" });
    assert.match(runWake(dir, out).report, /^- 责任分级缺失：.*run\/spec\.md 没有「## 责任分级」节$/m);
    writeFiles(dir, { "run/spec.md": SPEC("pkg/a/").replace("`pkg/a/`", "pkg/a/") });
    assert.match(runWake(dir, out).report, /^- 责任分级缺失：.*run\/spec\.md 的责任分级表里没有反引号括起的路径$/m);

    writeFiles(dir, { "elsewhere/spec.md": SPEC("pkg/", "run/") });
    const given = runWake(dir, out, ["--spec", join(dir, "elsewhere/spec.md")]).report;
    assert.doesNotMatch(given, /^- (责任分级缺失|圈外改动)/m, "给了 --spec 就读它；pkg/ 盖住 pkg/c/y.ts，elsewhere/spec.md 自身不算");
    assert.match(spawnSync("node", [SCRIPT, "--help"], { encoding: "utf8" }).stdout, /--spec <spec\.md>/);
  } finally { dispose(dir); }
});

test("圈外发现：条数与挡住验收的条数写进「进度」节，与上一轮比差；plan 没有这一节时写明", () => {
  const dir = makeRepo({ "README.md": "x\n", ".gitignore": "out/\n" });
  const out = join(dir, "out/sentinel");
  try {
    const head = git(dir, "rev-parse --short HEAD");
    writeFiles(dir, { "run/spec.md": SPEC("run/"), "run/plan.md": TEMPLATE_PLAN(head, "2026-11-08T10:00Z", "", FINDING("pkg/x", "无")) });
    assert.match(runWake(dir, out).report, /## 进度\n[\s\S]*^圈外发现：1 条，挡住验收 0 条$/m, "第一轮没有上一轮，不比差");
    writeFiles(dir, { "run/plan.md": TEMPLATE_PLAN(head, "2026-11-08T10:00Z", "", FINDING("pkg/x", "无") + FINDING("pkg/y", "C2") + FINDING("pkg/z", " C1、C3 ") + FINDING("pkg/w", "无（已绕）")) });
    assert.match(runWake(dir, out).report, /^圈外发现：4 条（比上一轮 \+3），挡住验收 2 条（比上一轮 \+2）$/m, "以「无」开头的（如「无（已绕）」）不算挡住");
    writeFiles(dir, { "run/plan.md": TEMPLATE_PLAN(head, "2026-11-08T10:00Z", "", FINDING("pkg/y", "C2")) });
    assert.match(runWake(dir, out).report, /^圈外发现：1 条（比上一轮 -3），挡住验收 1 条（比上一轮 -1）$/m);
    writeFiles(dir, { "run/plan.md": PLAN });
    assert.match(runWake(dir, out).report, /^圈外发现：plan 没有「## 圈外发现」节$/m);
  } finally { dispose(dir); }
});
