// release-notes：从 CHANGELOG 取某一版的 Release 标题与正文；check-repo 的「发版说明」一项核最新一节合模板
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { REPO_ROOT, dispose } from "./fixture.mjs";

const SKIP = new Set([".git", "node_modules", "coverage", "tmp"]);
const copyRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), "pqw-release-notes-"));
  cpSync(REPO_ROOT, dir, { recursive: true, filter: (src) => !SKIP.has(src.slice(REPO_ROOT.length).split("/")[0]) });
  return dir;
};
const notes = (dir, ...args) => spawnSync("node", [join(dir, "scripts/release-notes.mjs"), ...args], { encoding: "utf8" });
const check = (dir) => {
  const lines = spawnSync("node", [join(dir, "scripts/check-repo.mjs")], { encoding: "utf8" }).stdout.split("\n");
  const at = lines.findIndex((l) => l.startsWith("[发版说明]"));
  if (at < 0) return [];
  const end = lines.findIndex((l, i) => i > at && !l.startsWith("  - "));
  return lines.slice(at + 1, end < 0 ? undefined : end).map((l) => l.slice(4));
};
const CHANGELOG = `# x

## 9.9.9 · 一个标题

One English sentence.

**要你动手的：** 不用。
**接入约定：** 没变。

### 变了什么

- **甲**：一条。

### 细节

很长的来龙去脉。

## 9.9.8 · 上一版

Older.
`;

test("release-notes：取出标题与正文，正文到「细节」之前为止，末尾带完整记录的链接；没有这一版时退出 1", () => {
  const dir = copyRepo();
  try {
    writeFileSync(join(dir, "CHANGELOG.md"), CHANGELOG);
    assert.equal(notes(dir, "9.9.9", "--title").stdout, "v9.9.9 · 一个标题\n");
    assert.equal(notes(dir, "v9.9.9").stdout, "One English sentence.\n\n**要你动手的：** 不用。\n**接入约定：** 没变。\n\n### 变了什么\n\n- **甲**：一条。\n\n完整记录见 [CHANGELOG](https://github.com/PanQiWei/pqw-skills/blob/v9.9.9/CHANGELOG.md)。\n");
    const missing = notes(dir, "1.2.3");
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /CHANGELOG\.md 里没有 1\.2\.3 这一节/);
  } finally { dispose(dir); }
});

test("发版说明：仓库本身不报；最新一节的版本与清单不一致、缺英文一句、缺两行固定行、缺「变了什么」的条目，各报一处", () => {
  const dir = copyRepo();
  try {
    assert.deepEqual(check(dir), []);
    const version = JSON.parse(readFileSync(join(dir, ".claude-plugin/plugin.json"), "utf8")).version;
    writeFileSync(join(dir, "CHANGELOG.md"), "# x\n\n## 9.9.9 · 标题\n\n只有中文的一句。\n\n### 变了什么\n\n没有条目。\n");
    assert.deepEqual(check(dir), [
      `CHANGELOG.md 最新一节是 9.9.9，清单的版本是 ${version}`,
      "CHANGELOG.md 的 9.9.9 一节：标题下第一段要是一句英文",
      "CHANGELOG.md 的 9.9.9 一节：缺以「**要你动手的：**」开头的一行",
      "CHANGELOG.md 的 9.9.9 一节：缺以「**接入约定：**」开头的一行",
      "CHANGELOG.md 的 9.9.9 一节：「### 变了什么」下要有以「- **」开头的条目",
    ]);
    writeFileSync(join(dir, "CHANGELOG.md"), "# x\n\n## 9.9.9\n\n没有标题。\n");
    assert.deepEqual(check(dir)[0], "CHANGELOG.md 的第一节标题要写成「## <版本> · <一句标题>」");
  } finally { dispose(dir); }
});
