// 直接打 lib/report.mjs、lib/demo.mjs、lib/args.mjs 的函数。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOptions } from "../skills/progress-artifacts/scripts/lib/args.mjs";
import { esc as escDemo, requiredGiven, fromSkeleton, sliceId, sliceSection, appendSection, SECTIONS_END } from "../skills/progress-artifacts/scripts/lib/demo.mjs";
import { esc, inline, parseOverview, parseNarrative, renderNarrative, statusClass, renderSlices, renderRemaining, renderArchitecture, renderMetrics, renderDecisions, renderDemo, renderReport } from "../skills/progress-artifacts/scripts/lib/report.mjs";

test("参数：每个 --名 带一个值；--help 与 -h 返回 help；缺值或不以 -- 开头是参数错误", () => {
  assert.deepEqual(parseOptions(["--plan", "p.md", "--out", "o.html"]), { opts: { plan: "p.md", out: "o.html" } });
  assert.deepEqual(parseOptions([]), { opts: {} });
  assert.deepEqual(parseOptions(["--plan", "p.md", "--help"]), { help: true });
  assert.deepEqual(parseOptions(["-h"]), { help: true });
  assert.deepEqual(parseOptions(["--plan"]), { error: "参数错误 --plan" });
  assert.deepEqual(parseOptions(["plan", "x"]), { error: "参数错误 plan" });
  assert.deepEqual(parseOptions(["--plan", "--out"]), { opts: { plan: "--out" } });
});

test("demo：转义、必填项、骨架标题、切片号补零、段落、同号替换、标记前插入、没有标记返回 null", () => {
  assert.equal(escDemo(`a<b>&"c"`), `a&lt;b&gt;&amp;"c"`);
  assert.equal(requiredGiven({ demo: "d", slice: "1", title: "t", text: "x" }), true);
  assert.equal(requiredGiven({ demo: "d", slice: "1", title: "t", file: "f" }), true);
  assert.equal(requiredGiven({ demo: "d", slice: "1", title: "t" }), false);
  assert.equal(requiredGiven({ demo: "d", slice: "1", text: "x" }), false);
  assert.equal(requiredGiven({ demo: "d", title: "t", text: "x" }), false);
  assert.equal(requiredGiven({ slice: "1", title: "t", text: "x" }), false);
  assert.equal(fromSkeleton("<title>{{title}}</title><h1>{{title}}</h1>", "a<b"), "<title>a&lt;b</title><h1>a&lt;b</h1>");
  assert.equal(fromSkeleton("<title>{{title}}</title>", undefined), "<title>demo</title>");
  assert.equal(fromSkeleton("<title>{{title}}</title>", ""), "<title></title>", "给了空标题就是空");
  assert.equal(sliceId("3"), "03");
  assert.equal(sliceId("12"), "12");
  const sec = sliceSection({ id: "02", title: "a<b", body: "\n<p>x</p>\n", when: "2026-11-08 02:00Z" });
  assert.equal(sec, `<!-- pqw:slice 02 -->\n<section class="slice" id="slice-02">\n<h2>切片 02：a&lt;b</h2>\n<div class="when">2026-11-08 02:00Z</div>\n<p>x</p>\n</section>\n<!-- /pqw:slice 02 -->`);
  const page = `<main>\n${SECTIONS_END}\n</main>`;
  const one = appendSection(page, sec, "02");
  assert.equal(one, `<main>\n${sec}\n${SECTIONS_END}\n</main>`);
  const sec2 = sliceSection({ id: "02", title: "改", body: "<p>y</p>", when: "w" });
  const replaced = appendSection(one, sec2, "02");
  assert.equal(replaced, `<main>\n${sec2}\n${SECTIONS_END}\n</main>`);
  const sec3 = sliceSection({ id: "03", title: "三", body: "<p>z</p>", when: "w" });
  const two = appendSection(replaced, sec3, "03");
  assert.equal(two, `<main>\n${sec2}\n${sec3}\n${SECTIONS_END}\n</main>`);
  assert.equal(appendSection("<main></main>", sec, "02"), null);
});

const PLAN = `# 计划

## 进度总览

进度：[■□□] 1/3 切片已完成 · 更新 T · head abc
当前：切片 02 实施

| 切片 | 交付的行为 | 对应验收 | 状态 |
| --- | --- | --- | --- |
| 01 | 登录 \`a\` | C1 | 已完成 abc |
| 02 | **健康**检查 | C2 | 进行中（x） |
| 03 | 日志 | C3 | 受阻（y） |
| 04 | 导出 | C4 | 跳过（z） |
| 05 | 备份 | C5 | 待做 |
| 总计 | 五片 | | |

## 切片

| 切片 | 交付的行为 | 对应验收 | 状态 |
| 09 | 不在总览里 | C9 | 待做 |
`;

test("进度总览：进度行、当前行、只收总览节里编号行的切片表", () => {
  const o = parseOverview(PLAN);
  assert.equal(o.progress, "[■□□] 1/3 切片已完成 · 更新 T · head abc");
  assert.equal(o.current, "切片 02 实施");
  assert.deepEqual(o.rows.map((r) => [r.id, r.behavior, r.criteria, r.status]), [["01", "登录 `a`", "C1", "已完成 abc"], ["02", "**健康**检查", "C2", "进行中（x）"], ["03", "日志", "C3", "受阻（y）"], ["04", "导出", "C4", "跳过（z）"], ["05", "备份", "C5", "待做"]]);
  const none = parseOverview("# 无\n\n正文\n");
  assert.deepEqual(none, { progress: "没有进度行", current: "", rows: [] });
  assert.deepEqual(parseOverview("进度：\n当前：\n"), { progress: "", current: "", rows: [] }, "空的进度行是空串，不是没有");
  assert.deepEqual(parseOverview("## 进度总览\n\n| 1 | 2 |\n| 01 | a | C1 |\n").rows, []);
});

test("切片表与剩余：状态类、转义与行内标记；已完成与跳过不算剩余", () => {
  assert.deepEqual(["已完成 a", "进行中（b）", "受阻（c）", "待做", "跳过（d）"].map(statusClass), ["st-done", "st-doing", "st-blocked", "st-todo", "st-todo"]);
  const rows = parseOverview(PLAN).rows;
  const table = renderSlices(rows);
  assert.match(table, /^<table><thead><tr><th>切片<\/th><th>交付的行为<\/th><th>验收<\/th><th>状态<\/th><\/tr><\/thead><tbody>/);
  assert.match(table, /<tr><td>01<\/td><td>登录 <code>a<\/code><\/td><td>C1<\/td><td class="st-done">已完成 abc<\/td><\/tr>/);
  assert.match(table, /<td><strong>健康<\/strong>检查<\/td><td>C2<\/td><td class="st-doing">/);
  assert.match(table, /<td class="st-blocked">受阻（y）<\/td>/);
  assert.equal(renderSlices([]), `<p class="muted">plan 里没有切片表。</p>`);
  const left = renderRemaining(rows);
  assert.equal(left, `<ul><li>切片 02：<strong>健康</strong>检查<span class="muted">（进行中（x））</span></li><li>切片 03：日志<span class="muted">（受阻（y））</span></li><li>切片 05：备份<span class="muted">（待做）</span></li></ul>`);
  assert.equal(renderRemaining(rows.filter((r) => r.id === "01")), `<p>没有剩下的切片。</p>`);
  assert.equal(renderRemaining([]), `<p>没有剩下的切片。</p>`);
});

test("架构图：都没有写无变化；只有前或后也出图；Mermaid 文本转义", () => {
  assert.equal(renderArchitecture(null, null), `<p class="muted">本次没有架构层面的变化。</p>`);
  const only = renderArchitecture(null, "flowchart LR\n  A --> B\n");
  assert.equal(only, `<div class="grid"><div class="fig"><h3>之后</h3><pre class="mermaid">flowchart LR\n  A --&gt; B</pre></div></div><p class="muted">离线时图以 Mermaid 文本显示。</p>`);
  const both = renderArchitecture("x", "y");
  assert.match(both, /<h3>之前<\/h3><pre class="mermaid">x<\/pre>.*<h3>之后<\/h3><pre class="mermaid">y<\/pre>/);
  assert.match(renderArchitecture("x", null), /之前/);
  assert.doesNotMatch(renderArchitecture("x", null), /之后/);
});

test("读数：两份都没有写未测量；函数表最多 20 行；无覆盖与百分比；未覆盖文件；变异计数、分数、预算与存活清单", () => {
  const none = renderMetrics(null, null);
  assert.equal(none, `<p>结构读数：未测量。</p><p>差分变异：未测量。</p><p class="muted">读数是线索，不是结论。</p>`);
  const fn = (i) => ({ name: `f${i}`, path: "a.ts", startLine: i, endLine: i + 1, cyclomatic: 2, cognitive: 1, coverage: 0.5, crap: 2.25 });
  const small = renderMetrics({ functions: [fn(1), { ...fn(2), coverage: null, crap: null }], uncovered: [{ path: "x.md", reason: "r<" }], summary: { maxCyclomatic: 2, maxCognitive: 1, maxCrap: 2.25 } }, null);
  assert.match(small, /^<p>改动函数 2 个；圈复杂度最高 2，认知复杂度最高 1，CRAP 最高 2\.3。<\/p><table>/);
  assert.match(small, /<tr><td>f1<\/td><td>a\.ts<\/td><td>1-2<\/td><td>2<\/td><td>1<\/td><td>50%<\/td><td>2\.3<\/td><td><\/td><td><\/td><td><\/td><\/tr><tr><td>f2<\/td><td>a\.ts<\/td><td>2-3<\/td><td>2<\/td><td>1<\/td><td>无覆盖<\/td><td>无覆盖<\/td><td><\/td><td><\/td><td><\/td><\/tr><\/tbody><\/table><p class="muted">未覆盖的改动文件：x\.md（r&lt;）<\/p>/, "第五程 C4 起函数表多带位、原 → 现、变差三列");
  const banded = renderMetrics({ functions: [{ ...fn(3), band: "warn", baseline: { cyclomatic: 11 }, trend: "up", worse: true }, { ...fn(4), band: "ok", baseline: null, trend: "new", worse: false }], summary: { maxCyclomatic: 2, maxCognitive: 1, maxCrap: 2.25, explain: ["f3"], overLineNotWorse: 0 }, warnings: ["覆盖率报告早于改动文件 a.ts，行号可能错位"] }, null);
  assert.match(banded, /CRAP 最高 2\.3；要交代 1 个变差，另有 0 个过线但没有变差。<\/p>/);
  assert.match(banded, /<td>warn<\/td><td>11 → 2<\/td><td>!<\/td><\/tr><tr><td>f4<\/td>.*<td>ok<\/td><td>新 → 2<\/td><td><\/td><\/tr>/);
  assert.match(banded, /<p class="muted">警告：覆盖率报告早于改动文件 a\.ts，行号可能错位<\/p>/);
  assert.doesNotMatch(small, /只列前 20 个/);
  assert.match(renderMetrics({ summary: { maxCrap: null } }, null), /改动函数 0 个；圈复杂度最高 未测量，认知复杂度最高 未测量，CRAP 最高 无覆盖。<\/p><p>差分变异/);
  assert.match(renderMetrics({}, null), /改动函数 0 个；圈复杂度最高 未测量，认知复杂度最高 未测量，CRAP 最高 无覆盖。<\/p>/, "没有 summary 与 functions 也能渲染");
  assert.match(renderMetrics({ summary: { maxCyclomatic: 0, maxCognitive: 0, maxCrap: 0 } }, null), /圈复杂度最高 0，认知复杂度最高 0，CRAP 最高 0\.0。/, "0 是读数，不是未测量");
  const many = renderMetrics({ functions: Array.from({ length: 21 }, (_, i) => fn(i)), summary: {} }, null);
  assert.equal((many.match(/<tr><td>f/g) ?? []).length, 20);
  assert.match(many, /只列前 20 个，完整读数在 JSON。/);
  const exactly = renderMetrics({ functions: Array.from({ length: 20 }, (_, i) => fn(i)), summary: {} }, null);
  assert.equal((exactly.match(/<tr><td>f/g) ?? []).length, 20);
  assert.doesNotMatch(exactly, /只列前 20 个/, "正好 20 个不提示截断");
  const mu = renderMetrics(null, { summary: { total: 3, killed: 1, survived: 1, uncovered: 1, notRun: 0, score: 0.5 }, budget: { exceeded: true }, survivors: [{ file: "a.ts", line: 4, unit: "f", original: "!", mutant: "", suggestion: "补<断言" }] });
  assert.match(mu, /<p>差分变异：位点 3，杀死 1、存活 1、无覆盖 1、未跑 0；分数 50%；预算用尽。<\/p><p>存活的位点：<\/p><ul><li><code>a\.ts:4<\/code> f：<code>!<\/code> 换成 <code>（删去）<\/code>。补&lt;断言<\/li><\/ul>/);
  const muNone = renderMetrics(null, { summary: { score: null }, survivors: [] });
  assert.match(muNone, /位点 0，杀死 0、存活 0、无覆盖 0、未跑 0；分数 无。<\/p><p class="muted">/);
  assert.match(renderMetrics(null, {}), /位点 0，杀死 0、存活 0、无覆盖 0、未跑 0；分数 无。<\/p><p class="muted">/, "没有 summary 与 survivors 也能渲染");
  assert.match(renderMetrics(null, { survivors: [{ file: "a.ts", line: 1, unit: "f", original: "<", mutant: "<=" }] }), /<code>&lt;<\/code> 换成 <code>&lt;=<\/code>。<\/li>/);
  const invalid = renderMetrics(null, { summary: { total: 3, killed: 0, survived: 0, valid: false, invalidReason: "基线不通过", score: null }, survivors: [] });
  assert.match(invalid, /<p>差分变异：测量无效（基线不通过）。<\/p><p class="muted">/);
  assert.doesNotMatch(invalid, /杀死 0/);
  const timed = renderMetrics(null, { summary: { total: 3, killed: 3, survived: 0, uncovered: 0, notRun: 0, timedOut: 2, valid: true, score: 1 }, survivors: [], unmutated: [{ file: "a.ts", unit: null, lines: [1, 1], reason: "改动行不在任何有名单元里" }, { file: "a.ts", unit: "g", lines: [5, 7], reason: "单元里没有可替换的位点" }] });
  assert.match(timed, /杀死 3（其中超时 2）、存活 0/);
  assert.match(timed, /<p class="muted">没有位点的改动段（不进分数）：a\.ts:1-1（改动行不在任何有名单元里）；a\.ts:5-7 g（单元里没有可替换的位点）<\/p>/);
});

test("待决事项与 demo 链接", () => {
  assert.deepEqual(renderDecisions(""), { decisions: "<p>没有等你决定的。</p>", lead: "没有等你决定的。" });
  assert.deepEqual(renderDecisions("说明\n- 公开 `仓库`\n-不算\n  - **范围**\n"), { decisions: "<ul><li>公开 <code>仓库</code></li><li><strong>范围</strong></li></ul>", lead: "有 2 件事等你决定，见末尾。" });
  assert.equal(renderDemo("a/b.html"), `<p>demo：<a href="a/b.html">a/b.html</a>，直接在浏览器打开。</p>`);
  assert.equal(renderDemo(undefined), `<p>本次没有可上手的变化。</p>`);
});

test("套模板：五个纯文本变量转义，其余原样，没有的占位写空", () => {
  assert.equal(esc(`<a href="x">&`), `&lt;a href=&quot;x&quot;&gt;&amp;`);
  assert.equal(inline("a `b` **c** <d>"), "a <code>b</code> <strong>c</strong> &lt;d&gt;");
  const t = "{{title}}|{{generatedAt}}|{{lead}}|{{progress}}|{{current}}|{{sliceTable}}|{{none}}";
  const out = renderReport(t, { title: "<t>", generatedAt: "<g>", lead: "<l>", progress: "<p>", current: "<c>", sliceTable: "<table></table>" });
  assert.equal(out, "&lt;t&gt;|&lt;g&gt;|&lt;l&gt;|&lt;p&gt;|&lt;c&gt;|<table></table>|");
});

const NARRATED = `# 示例 交付计划（revision 1）

## 进度总览

进度：[■□□] 1/3 切片已完成 · 更新 T · head abc
当前：切片 02 实施

| 切片 | 交付的行为 | 对应验收 | 状态 |
| --- | --- | --- | --- |
| 01 | a | C1 | 已完成 abc |
| 02 | b | C2 | 待做 |

## 一程目标与前后差别

开头说明，解释 \`术语\`。

### 产品层：用的人会得到什么

第一段，讲 \`现状\`。

第二段，讲做完之后。

### 技术层：哪一块变了

只有一段。

## 预算与回看

- 预算。

## 切片

### 01：a

- **交付：** a。
- **交付这片的意义：** 对用户，能看到 **进度**；对系统，少一层。

### 02：b

- **交付：** b。

## 顺序与并行
`;

test("叙述：产品层按空行分段、技术层一段、意义只收写了的切片；没有节时两层都空", () => {
  const n = parseNarrative(NARRATED);
  assert.deepEqual(n.intro, ["开头说明，解释 `术语`。"]);
  assert.deepEqual(n.product, ["第一段，讲 `现状`。", "第二段，讲做完之后。"]);
  assert.deepEqual(n.technical, ["只有一段。"]);
  assert.deepEqual([...n.meanings], [["01", "对用户，能看到 **进度**；对系统，少一层。"]]);
  const none = parseNarrative(PLAN);
  assert.deepEqual([none.intro, none.product, none.technical, none.meanings.size], [[], [], [], 0]);
  const tight = parseNarrative("## 一程目标与前后差别\n### 产品层：x\n### 技术层：y\n\n一段。\n\n## 切片\n\n### 备注\n\n不是切片。\n\n### 01：a\n\n- **交付这片的意义：** 有。\n");
  assert.deepEqual([tight.intro, tight.product, tight.technical, [...tight.meanings]], [[], [], ["一段。"], [["01", "有。"]]], "小标题紧挨着时开头与产品层为空；切片节里没有编号的小标题跳过");
});

test("叙述渲染：两层各成小节并转行内标记；只有一层时另一层写没有写；都没有时说明 plan 没写；切片表在有意义的行下面多一行", () => {
  const html = renderNarrative(parseNarrative(NARRATED));
  assert.match(html, /^<p>开头说明，解释 <code>术语<\/code>。<\/p><h3>产品层/, "开头说明先于产品层");
  assert.match(html, /<h3>产品层：用的人会得到什么<\/h3><p>第一段，讲 <code>现状<\/code>。<\/p><p>第二段，讲做完之后。<\/p><h3>技术层：哪一块的工作方式变了<\/h3><p>只有一段。<\/p>/);
  assert.match(renderNarrative({ product: ["x"], technical: [] }), /^<h3>产品层.*技术层[^<]*<\/h3><p class="muted">没有写。<\/p>/, "没有 intro 字段时照常");
  assert.equal(renderNarrative({ product: [], technical: [] }), `<p class="muted">plan 没有写目标与前后差别。</p>`);
  const rows = parseOverview(NARRATED).rows;
  const table = renderSlices(rows, parseNarrative(NARRATED).meanings);
  assert.match(table, /<td>01<\/td>.*<\/tr><tr class="meaning"><td colspan="4">对用户，能看到 <strong>进度<\/strong>；对系统，少一层。<\/td><\/tr><tr><td>02<\/td>/);
  assert.doesNotMatch(table, /<td>02<\/td>.*<tr class="meaning">/);
  assert.equal(renderSlices(rows), renderSlices(rows, new Map()), "不给意义时与原来一样");
});
