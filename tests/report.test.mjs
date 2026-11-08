import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = new URL("../skills/progress-artifacts/scripts/build-report.mjs", import.meta.url).pathname;
const PLAN = `# 示例 交付计划（revision 1）\n\n## 进度总览\n\n进度：[■■■■■□□□□□] 2/4 切片已完成 · 更新 2026-11-07T17:07Z · head ee96746\n当前：切片 03 开工包\n\n| 切片 | 交付的行为 | 对应验收 | 状态 |\n| --- | --- | --- | --- |\n| 01 | 结构读数工具 | C1 C2 | 已完成 7b5796a |\n| 02 | 差分变异工具 | C3 | 已完成 ee96746 |\n| 03 | HTML 汇报件 | C6 | 进行中（模板） |\n| 04 | demo 骨架 | C7 | 待做 |\n\n## 切片\n`;
const METRICS = { kind: "pqw-metrics", base: "abc", head: "def", functions: [{ path: "src/a.ts", name: "f", startLine: 1, endLine: 9, cyclomatic: 7, cognitive: 9, coverage: 0.5, crap: 12.1 }], uncovered: [{ path: "README.md", reason: "不是源码" }], summary: { count: 1, maxCyclomatic: 7, maxCognitive: 9, maxCrap: 12.1, coverageProvided: true } };
const MUTATION = { kind: "pqw-mutation", summary: { total: 5, killed: 3, survived: 1, uncovered: 1, notRun: 0, score: 0.75 }, budget: { exceeded: false }, survivors: [{ file: "src/a.ts", unit: "f", line: 4, original: "<", mutant: "<=", category: "relational", suggestion: "补边界断言" }] };

const setup = () => { const d = mkdtempSync(join(tmpdir(), "pqw-report-")); writeFileSync(join(d, "plan.md"), PLAN); writeFileSync(join(d, "m.json"), JSON.stringify(METRICS)); writeFileSync(join(d, "mu.json"), JSON.stringify(MUTATION)); writeFileSync(join(d, "before.mmd"), "flowchart LR\n  A --> B\n"); writeFileSync(join(d, "after.mmd"), "flowchart LR\n  A --> B --> C\n"); writeFileSync(join(d, "decisions.md"), "- **要不要公开仓库**：建议公开；依据 README 的安装路线；风险 无。\n"); return d; };

test("--help 退出 0；缺 --plan 退出 2", () => {
  assert.equal(spawnSync("node", [SCRIPT, "--help"], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync("node", [SCRIPT, "--out", "x.html"], { encoding: "utf8" }).status, 2);
});

test("全输入：进度、切片表、读数、存活、前后图、等你决定都进 HTML", () => {
  const d = setup();
  try {
    const r = spawnSync("node", [SCRIPT, "--plan", join(d, "plan.md"), "--metrics", join(d, "m.json"), "--mutation", join(d, "mu.json"), "--before", join(d, "before.mmd"), "--after", join(d, "after.mmd"), "--decisions", join(d, "decisions.md"), "--demo", "demo.html", "--out", join(d, "r.html"), "--title", "示例"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(join(d, "r.html"), "utf8");
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /2\/4 切片已完成/);
    assert.match(html, /当前：切片 03 开工包/);
    assert.match(html, /HTML 汇报件/);
    assert.match(html, /进行中（模板）/);
    assert.match(html, /<td>f<\/td>/);
    assert.match(html, /12\.1/);
    assert.match(html, /杀死 3/);
    assert.match(html, /补边界断言/);
    assert.match(html, /A --&gt; B --&gt; C/);
    assert.match(html, /要不要公开仓库/);
    assert.match(html, /demo\.html/);
    assert.match(html, /prefers-color-scheme: dark/);
    assert.match(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/mermaid\/\d+\.\d+\.\d+\//);
    assert.doesNotMatch(html, /[—–]/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("缺输入：读数写未测量，等你决定写无，体验写没有", () => {
  const d = setup();
  try {
    const r = spawnSync("node", [SCRIPT, "--plan", join(d, "plan.md"), "--out", join(d, "r.html")], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(join(d, "r.html"), "utf8");
    assert.match(html, /未测量/);
    assert.match(html, /没有等你决定的/);
    assert.match(html, /本次没有可上手的变化/);
    assert.match(html, /还缺什么[\s\S]*demo 骨架/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("叙述与结构：plan 有目标节与意义段时进网页开头与切片行，顶部写结构合模板；没有时写 plan 没写；结构有缺陷时写缺陷数；找不到 check-plan 写未核结构", () => {
  const d = setup();
  try {
    const narrated = PLAN.replace("## 切片\n", "## 一程目标与前后差别\n\n### 产品层：得到什么\n\n人读得懂。\n\n### 技术层：变了什么\n\n脚本多读两段。\n\n## 预算与回看\n\n- 预算。\n\n## 文档维护表\n\n| 文档 | 给谁看 | 什么时候更新 | 只动哪一节 | 怎么判断过期 | 最近更新 |\n| --- | --- | --- | --- | --- | --- |\n\n## 切片\n\n### 01：结构读数工具\n\n- **交付：** a。\n- **交付这片的意义：** 对用户，看到读数；对系统，先有尺子。\n\n**开工包**\n\n- 无\n\n**收口**\n\n- [x] 提交\n\n### 02：差分变异工具\n\n- **交付这片的意义：** 对用户，x；对系统，y。\n\n**开工包**\n\n**收口**\n\n### 03：HTML 汇报件\n\n- **交付这片的意义：** 对用户，x；对系统，y。\n\n**开工包**\n\n**收口**\n\n### 04：demo 骨架\n\n- **交付这片的意义：** 对用户，x；对系统，y。\n\n**开工包**\n\n**收口**\n\n## 顺序与并行\n\n- 串行\n\n## 一程交付声明\n\n- [ ] 五项\n");
    writeFileSync(join(d, "plan.md"), narrated);
    const r = spawnSync("node", [SCRIPT, "--plan", join(d, "plan.md"), "--out", join(d, "r.html")], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(join(d, "r.html"), "utf8");
    assert.match(html, /<h2>这程为什么做<\/h2>\s*<h3>产品层：用的人会得到什么<\/h3><p>人读得懂。<\/p><h3>技术层：哪一块的工作方式变了<\/h3><p>脚本多读两段。<\/p>/);
    assert.match(html, /<tr class="meaning"><td colspan="4">对用户，看到读数；对系统，先有尺子。<\/td><\/tr>/);
    assert.match(html, /· plan 结构合模板<\/div>/);

    writeFileSync(join(d, "plan.md"), narrated.replace("## 文档维护表", "## 别的表"));
    spawnSync("node", [SCRIPT, "--plan", join(d, "plan.md"), "--out", join(d, "r2.html")], { encoding: "utf8" });
    assert.match(readFileSync(join(d, "r2.html"), "utf8"), /· plan 结构不合模板：1 处缺陷<\/div>/);

    writeFileSync(join(d, "plan.md"), PLAN);
    spawnSync("node", [SCRIPT, "--plan", join(d, "plan.md"), "--out", join(d, "r3.html")], { encoding: "utf8" });
    const plain = readFileSync(join(d, "r3.html"), "utf8");
    assert.match(plain, /<p class="muted">plan 没有写目标与前后差别。<\/p>/);
    assert.match(plain, /· plan 结构不合模板：\d+ 处缺陷<\/div>/, "抬头是模板格式但缺节");

    const missing = spawnSync("node", [SCRIPT, "--plan", join(d, "plan.md"), "--out", join(d, "r4.html")], { encoding: "utf8", env: { ...process.env, PQW_CHECK_PLAN: join(d, "nope.mjs") } });
    assert.equal(missing.status, 0);
    assert.match(readFileSync(join(d, "r4.html"), "utf8"), /· 未核结构：找不到 check-plan<\/div>/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
