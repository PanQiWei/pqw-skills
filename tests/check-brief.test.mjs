// check-brief：派发简报九节齐；评审者与验收者的简报要有「允许的动作」「不做的事」，其余地方不写对抗式的要求。
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkBrief } from "../skills/delegate-brief/scripts/lib/check-brief.mjs";

const SCRIPT = new URL("../skills/delegate-brief/scripts/check-brief.mjs", import.meta.url).pathname;
const TEMPLATE = new URL("../skills/delegate-brief/brief-template.md", import.meta.url).pathname;
const body = () => readFileSync(TEMPLATE, "utf8").split("\n---\n").slice(1).join("\n---\n");
const asRole = (role) => body().replace("- 角色：<写者 / 只读评审者 / 验收者>", `- 角色：${role}`);
const messages = (text) => checkBrief(text).map((d) => d.message);

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
