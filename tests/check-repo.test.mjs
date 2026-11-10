// check-repo：圈外的问题只有一处正文。在仓库的副本上改坏一处再跑，只看这一类检查报没报；别的检查依赖本机外部技能，不在这里断言。
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { REPO_ROOT, dispose } from "./fixture.mjs";

const SKIP = new Set([".git", "node_modules", "coverage", "tmp"]);
const CHECK = "[圈外的问题只有一处正文]";
const ENTRY = "skills/single-session-dev-flow/SKILL.md";

/** 仓库副本：不带 Git、依赖与过程目录。 */
const copyRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), "pqw-check-repo-"));
  cpSync(REPO_ROOT, dir, { recursive: true, filter: (src) => !SKIP.has(src.slice(REPO_ROOT.length).split("/")[0]) });
  return dir;
};
const run = (dir) => spawnSync("node", [join(dir, "scripts/check-repo.mjs")], { encoding: "utf8" }).stdout;
/** 这一类检查报出的条目。 */
const reported = (stdout) => {
  const lines = stdout.split("\n");
  const at = lines.findIndex((l) => l.startsWith(CHECK));
  if (at < 0) return [];
  const end = lines.findIndex((l, i) => i > at && !l.startsWith("  - "));
  return lines.slice(at + 1, end < 0 ? undefined : end).map((l) => l.slice(4));
};
const edit = (dir, file, from, to) => {
  const text = readFileSync(join(dir, file), "utf8");
  assert.ok(text.includes(from), `${file} 里没有「${from}」`);
  writeFileSync(join(dir, file), text.replace(from, to));
};

test("圈外的问题：仓库本身不报；别处提到「圈外发现」或「圈外的问题」却没链到入口那一节的行逐行报；带链接的、标题行与进度总览的「圈外发现：」行不报", () => {
  const dir = copyRepo();
  try {
    assert.deepEqual(reported(run(dir)), []);
    appendFileSync(join(dir, "skills/cleanup/SKILL.md"), "\n碰到圈外的问题记一行。\n\n本程的圈外发现交给人。\n\n圈外发现按入口[圈外的问题](../single-session-dev-flow/SKILL.md#圈外的问题)记。\n\n## 圈外发现\n\n### 圈外的问题\n\n圈外发现：2 条，挡住验收 1 条\n\n- 圈外发现：写在列表里的不是进度行\n");
    const lines = readFileSync(join(dir, "skills/cleanup/SKILL.md"), "utf8").split("\n");
    const at = (needle) => lines.findIndex((l) => l.startsWith(needle)) + 1;
    assert.deepEqual(reported(run(dir)), [
      `skills/cleanup/SKILL.md:${at("碰到圈外的问题")} 提到圈外的问题却没有链到入口那一节`,
      `skills/cleanup/SKILL.md:${at("本程的圈外发现")} 提到圈外的问题却没有链到入口那一节`,
      `skills/cleanup/SKILL.md:${at("- 圈外发现：写在列表里")} 提到圈外的问题却没有链到入口那一节`,
    ]);
  } finally { dispose(dir); }
});

test("圈外的问题：入口那一节缺失，或节里没有那张表，各报一处", () => {
  const dir = copyRepo();
  try {
    edit(dir, ENTRY, "\n## 圈外的问题\n", "\n## 别的问题\n");
    assert.deepEqual(reported(run(dir)), [`${ENTRY} 缺「## 圈外的问题」一节`]);
    edit(dir, ENTRY, "\n## 别的问题\n", "\n## 圈外的问题\n");
    edit(dir, ENTRY, "| 它在哪 | 处置 |", "| 位置 | 做法 |");
    assert.deepEqual(reported(run(dir)), [`${ENTRY} 的「## 圈外的问题」缺表「| 它在哪 | 处置 |」`]);
  } finally { dispose(dir); }
});
