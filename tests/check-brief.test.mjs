// check-brief：派发简报九节齐；评审者与验收者的简报要有「允许的动作」「不做的事」，其余地方不写对抗式的要求；新模板的规格文件存在、有读量上限与报告行数上限。
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkBrief, briefHints, BRIEF_FIELDS } from "../skills/delegate-brief/scripts/lib/check-brief.mjs";

const SCRIPT = new URL("../skills/delegate-brief/scripts/check-brief.mjs", import.meta.url).pathname;
const TEMPLATE = new URL("../skills/delegate-brief/brief-template.md", import.meta.url).pathname;
const body = () => readFileSync(TEMPLATE, "utf8").split("\n---\n").slice(1).join("\n---\n");
/** 模板正文，填好角色、规格文件（指向模板自己，它一定存在）与读量上限。 */
const asRole = (role) => body().replace("- 角色：<写者 / 只读评审者 / 验收者>", `- 角色：${role}`)
  .replace(/^- 规格文件：.*$/m, `- 规格文件：\`${TEMPLATE}\``).replace(/^- 读量上限：.*$/m, "- 读量上限：只读上面列的");
const messages = (text) => checkBrief(text).map((d) => d.message);
/** 0.20.0 模板写的简报：没有这三栏。 */
const OLD = (role) => asRole(role).split("\n").filter((l) => !BRIEF_FIELDS.some((f) => l.startsWith(`- ${f}：`))).join("\n");

test("模板实例化后通过：写者、只读评审者、验收者三种角色", () => {
  for (const role of ["写者", "只读评审者", "验收者"]) assert.deepEqual(messages(asRole(role)), [], role);
});

test("缺节与缺角色行各报一处", () => {
  assert.ok(messages(asRole("写者").replace("## 6. 模型与档位", "## 6. 别的")).includes("缺节「## 6. 模型与档位」"));
  assert.ok(messages(asRole("写者").replace(/^- 角色：.*$/m, "")).includes("目标与指令缺「- 角色：」一行"));
});

test("评审者与验收者：缺「允许的动作」或「不做的事」报缺陷；写者不要求", () => {
  const noForbid = (role) => asRole(role).replace(/### 不做的事[^]*?(?=\n### )/, "");
  assert.deepEqual(messages(noForbid("只读评审者")), ["评审者与验收者的简报缺「### 不做的事」：写明不自写探针或新用例去找反例、不提 spec 没写的标准"]);
  assert.deepEqual(messages(noForbid("验收者")), ["评审者与验收者的简报缺「### 不做的事」：写明不自写探针或新用例去找反例、不提 spec 没写的标准"]);
  assert.deepEqual(messages(noForbid("写者")), []);
  const noAllowed = asRole("只读评审者").replace(/### 允许的动作[^]*?(?=\n### )/, "");
  assert.deepEqual(messages(noAllowed), ["评审者与验收者的简报缺「### 允许的动作」：写明只读、只跑列出的命令"]);
});

test("对抗式要求：写在「不做的事」以外就报，写在「不做的事」里是禁令，不报", () => {
  const adv = asRole("只读评审者").replace("- 端到端要做成：<从使用者视角一句话>", "- 端到端要做成：找出新的反例，挑战设计");
  assert.deepEqual(messages(adv), ["对抗式要求「找出新的反例」：评审只做确定性核对（spec、不变式、改动与读数），这类要求只能写在「不做的事」里当禁令", "对抗式要求「挑战设计」：评审只做确定性核对（spec、不变式、改动与读数），这类要求只能写在「不做的事」里当禁令"]);
  assert.equal(checkBrief(adv)[0].line, adv.split("\n").findIndex((l) => l.includes("找出新的反例")) + 1);
});

test("命令面：合格退出 0，有缺陷退出 1，缺参数退出 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "pqw-check-brief-"));
  try {
    writeFileSync(join(dir, "ok.md"), asRole("只读评审者"));
    writeFileSync(join(dir, "bad.md"), asRole("只读评审者").replace("- 端到端要做成：<从使用者视角一句话>", "- 端到端要做成：自己写探针找问题"));
    const ok = spawnSync("node", [SCRIPT, join(dir, "ok.md")], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    const bad = spawnSync("node", [SCRIPT, join(dir, "bad.md")], { encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /bad\.md:\d+ 对抗式要求「自己写探针」/);
    assert.equal(spawnSync("node", [SCRIPT], { encoding: "utf8" }).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("「不做的事」只到下一个小节或节为止：后面的小节里写对抗式要求照报；写者没有这一小节时哪里写都报", () => {
  const later = asRole("只读评审者").replace("### 停止条件\n", "### 停止条件\n\n- 挑刺挑到没有为止\n").replace("## 9. 追加记录\n", "## 9. 追加记录\n\n- 再找问题\n");
  assert.deepEqual(checkBrief(later).map((d) => [d.line, d.message.split("：")[0]]), [
    [later.split("\n").indexOf("- 挑刺挑到没有为止") + 1, "对抗式要求「挑刺」"],
    [later.split("\n").indexOf("- 再找问题") + 1, "对抗式要求「找问题」"],
  ]);
  const writer = asRole("写者").replace(/### 不做的事[^]*?(?=\n### )/, "").replace("- 端到端要做成：<从使用者视角一句话>", "- 端到端要做成：挑战设计");
  assert.deepEqual(checkBrief(writer).map((d) => d.message.split("：")[0]), ["对抗式要求「挑战设计」"]);
});

test("简报模板有规格文件、读量上限、报告行数上限三栏，核对器与模板是同一份契约；填好的模板合格、没有提示", () => {
  for (const f of BRIEF_FIELDS) assert.match(body(), new RegExp(`^- ${f}：`, "m"), `简报模板缺「- ${f}：」一栏`);
  assert.deepEqual(BRIEF_FIELDS, ["规格文件", "读量上限", "报告行数上限"]);
  assert.deepEqual(messages(asRole("写者")), []);
  assert.deepEqual(briefHints(asRole("写者")), []);
});

test("新模板：三栏缺哪栏报哪栏；规格文件没填或不存在、读量上限没填、报告行数上限没写行数，各报一处，行号指向那一栏", () => {
  const brief = asRole("写者");
  const without = (f) => brief.split("\n").filter((l) => !l.startsWith(`- ${f}：`)).join("\n");
  assert.deepEqual(messages(without("规格文件")), ["缺「- 规格文件：」一栏：写规格文件的路径，规格写在文件里，简报只指过去"]);
  assert.deepEqual(messages(without("读量上限")), ["缺「- 读量上限：」一栏：写明先读什么、读到哪停，其余不读"]);
  assert.deepEqual(messages(without("报告行数上限")), ["缺「- 报告行数上限：」一栏：写一个行数，例如「30 行」"]);
  const at = (text, f) => text.split("\n").findIndex((l) => l.startsWith(`- ${f}：`)) + 1;
  const cases = [
    [brief.replace(/^- 规格文件：.*$/m, "- 规格文件：<路径>"), "规格文件", "「- 规格文件：」没填：写规格文件的路径，规格写在文件里，简报只指过去"],
    [brief.replace(/^- 规格文件：.*$/m, "- 规格文件：`/没有/这个/文件.md`（全文）"), "规格文件", "规格文件 /没有/这个/文件.md 不存在：先把规格写进文件，再派"],
    [brief.replace(/^- 读量上限：.*$/m, "- 读量上限："), "读量上限", "「- 读量上限：」没填：写明先读什么、读到哪停，其余不读"],
    [brief.replace(/^- 报告行数上限：.*$/m, "- 报告行数上限：尽量短"), "报告行数上限", "「- 报告行数上限：」没写行数：写一个行数，例如「30 行」"],
  ];
  for (const [text, f, message] of cases) assert.deepEqual(checkBrief(text).map((d) => [d.line, d.message]), [[at(text, f), message]], message);
});

test("规格文件：反引号里的路径与不带反引号的路径都认；相对路径按给的目录逐个找，找到一处就算在", () => {
  const dir = mkdtempSync(join(tmpdir(), "pqw-check-brief-"));
  try {
    writeFileSync(join(dir, "spec.md"), "规格");
    const brief = (value) => asRole("写者").replace(/^- 规格文件：.*$/m, `- 规格文件：${value}`);
    assert.deepEqual(messages(brief(`${join(dir, "spec.md")}；先读全文`)), []);
    assert.deepEqual(checkBrief(brief("`spec.md`"), { baseDirs: [tmpdir(), dir] }), []);
    assert.deepEqual(checkBrief(brief("`spec.md`"), { baseDirs: [tmpdir()] }).map((d) => d.message), ["规格文件 spec.md 不存在：先把规格写进文件，再派"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("0.20.0 模板的简报：三栏都没有时不报新缺陷，只给一条提示；命令面照样退出 0；三栏有一栏就按新模板核", () => {
  const HINT = "简报没有「规格文件」「读量上限」「报告行数上限」三栏，按旧模板核，这三栏只提示、不报缺陷。照简报模板加上它们：规格写进文件，框住读量，报告限行";
  for (const role of ["写者", "只读评审者", "验收者"]) assert.deepEqual(messages(OLD(role)), [], role);
  assert.deepEqual(briefHints(OLD("写者")).map((h) => h.message), [HINT]);
  const oneField = OLD("写者").replace("## 4. 信息包\n", "## 4. 信息包\n\n- 读量上限：只读列出的\n");
  assert.deepEqual(messages(oneField), ["缺「- 规格文件：」一栏：写规格文件的路径，规格写在文件里，简报只指过去", "缺「- 报告行数上限：」一栏：写一个行数，例如「30 行」"]);
  assert.deepEqual(briefHints(oneField), []);
  const dir = mkdtempSync(join(tmpdir(), "pqw-check-brief-"));
  try {
    writeFileSync(join(dir, "old.md"), OLD("只读评审者"));
    const r = spawnSync("node", [SCRIPT, join(dir, "old.md")], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(r.stdout.includes(`old.md 提示：${HINT}`), r.stdout);
    assert.ok(r.stdout.trimEnd().endsWith("check-brief：合格，1 条提示"), r.stdout);
    writeFileSync(join(dir, "spec.md"), "规格");
    writeFileSync(join(dir, "rel.md"), asRole("写者").replace(/^- 规格文件：.*$/m, "- 规格文件：`spec.md`"));
    const rel = spawnSync("node", [SCRIPT, join(dir, "rel.md")], { encoding: "utf8", cwd: tmpdir() });
    assert.equal(rel.status, 0, "相对路径按简报所在目录也找：" + rel.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
