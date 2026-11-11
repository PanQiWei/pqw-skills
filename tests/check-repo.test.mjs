// check-repo：圈外的问题只有一处正文；上下文地图的每一格兑现。在仓库的副本上改坏一处再跑，只看这一类检查报没报；别的检查依赖本机外部技能，不在这里断言。
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
const reported = (stdout, check = CHECK) => {
  const lines = stdout.split("\n");
  const at = lines.findIndex((l) => l.startsWith(check));
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

const MAP = "[上下文地图]";
const HOOK = "先答三问：应然、实然、差异。做法加载技能 `think-ought-vs-is`。";
const mapReported = (dir) => reported(run(dir), MAP);

test("上下文地图：仓库本身不报；删掉一处指路行或一个模板空位，报出是哪一格、哪个文件、缺什么", () => {
  const dir = copyRepo();
  try {
    assert.deepEqual(mapReported(dir), []);
    const closeout = "skills/slice-closeout/SKILL.md";
    writeFileSync(join(dir, closeout), readFileSync(join(dir, closeout), "utf8").replaceAll(HOOK, ""));
    assert.deepEqual(mapReported(dir), [`11 切片收口 × think-ought-vs-is：${closeout} 缺指路行「${HOOK}」`]);
    edit(dir, "skills/context-pack/slice-kickoff-template.md", "  - 实然：", "  - 现状：");
    assert.deepEqual(mapReported(dir).slice(0, 1), ["8 切片开工包 × think-ought-vs-is：skills/context-pack/slice-kickoff-template.md 缺空位「  - 实然：」"]);
  } finally { dispose(dir); }
});

test("上下文地图：别处一行里同时出现模型的两个标志词却没点技能名，报复述；点了技能名的不报", () => {
  const dir = copyRepo();
  try {
    appendFileSync(join(dir, "skills/cleanup/SKILL.md"), "\n先写应然，再看实然，从差异做事。\n\n应然与实然的做法见 `think-ought-vs-is`。\n\n- 应然：只有一个标志词的空位\n");
    const lines = readFileSync(join(dir, "skills/cleanup/SKILL.md"), "utf8").split("\n");
    assert.deepEqual(mapReported(dir), [`skills/cleanup/SKILL.md:${lines.indexOf("先写应然，再看实然，从差异做事。") + 1} 复述了「应然与实然」却没有点技能名 \`think-ought-vs-is\``]);
  } finally { dispose(dir); }
});

test("上下文地图：思维模型技能的骨架，description 领头、正文行数、固定的节各报一处", () => {
  const dir = copyRepo();
  const skill = "skills/think-ought-vs-is/SKILL.md";
  try {
    edit(dir, skill, "description: 思维模型：", "description: 横切技能：");
    edit(dir, skill, "\n## 写在哪\n", "\n## 放哪\n");
    appendFileSync(join(dir, skill), "\n多出来的一行\n".repeat(30));
    const got = mapReported(dir);
    assert.equal(got.length, 3);
    assert.equal(got[0], `${skill} 的 description 不以「思维模型：」领头`);
    assert.match(got[1], new RegExp(`^${skill} 正文 \\d+ 行，超过 50 行：细节挪到展开页$`));
    assert.equal(got[2], `${skill} 缺「## 写在哪」一节`);
  } finally { dispose(dir); }
});

/** 按 JSON 改地图：change 拿到解析后的对象和按行名找格的函数，就地改。 */
const editMap = (dir, change) => {
  const path = join(dir, "design/context-map.json");
  const map = JSON.parse(readFileSync(path, "utf8"));
  change(map, (row, skill) => map.rows.find((r) => r.row === row).cells[skill]);
  writeFileSync(path, JSON.stringify(map, null, 2));
};

test("上下文地图：skills 下多出一个不在地图里的 think- 技能，或格子的 kind 写错，各报一处", () => {
  const dir = copyRepo();
  try {
    cpSync(join(dir, "skills/think-ought-vs-is"), join(dir, "skills/think-extra"), { recursive: true });
    assert.ok(mapReported(dir).includes("skills/think-extra 不在 design/context-map.json 的 models 里"));
    editMap(dir, (_, cell) => { cell("11 切片收口", "think-ought-vs-is").kind = "链"; });
    assert.ok(mapReported(dir).includes("11 切片收口 × think-ought-vs-is：kind「链」不是 主、行、空 之一"));
  } finally { dispose(dir); }
});

test("上下文地图：标「主」的格，环节技能里没点技能名报一处；「主」格没列 files 也报", () => {
  const dir = copyRepo();
  try {
    const report = "skills/progress-artifacts/SKILL.md";
    writeFileSync(join(dir, report), readFileSync(join(dir, report), "utf8").replaceAll("`think-ought-vs-is`", "那个模型"));
    assert.deepEqual(mapReported(dir), [`12 汇报 × think-ought-vs-is：${report} 没有点名 \`think-ought-vs-is\``]);
    editMap(dir, (_, cell) => { delete cell("12 汇报", "think-ought-vs-is").files; });
    assert.deepEqual(mapReported(dir), ["12 汇报 × think-ought-vs-is：标「主」却没有列 files"]);
  } finally { dispose(dir); }
});
