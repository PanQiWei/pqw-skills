// 直接打 lib/metrics.mjs 的函数：排序、汇总、改动行归属、表格，再加两条从 CLI 进的边界。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { makeRepo, writeFiles, dispose, tsPath } from "./fixture.mjs";
import { byHotness, summarize, touchesOwnLines, formatMetrics, bandOf, parseThresholds, DEFAULT_THRESHOLDS } from "../skills/slice-closeout/scripts/lib/metrics.mjs";
import { touches, coverageOf } from "../skills/slice-closeout/scripts/lib/core.mjs";

const SCRIPT = new URL("../skills/slice-closeout/scripts/metrics.mjs", import.meta.url).pathname;
const TS = tsPath();
const skip = TS ? false : "没有 typescript，设 PQW_TS";

test("区间相碰：两端都是闭区间，相离不算", () => {
  assert.equal(touches([[3, 5]], 5, 9), true, "改动末行等于单元首行");
  assert.equal(touches([[3, 5]], 1, 3), true, "改动首行等于单元末行");
  assert.equal(touches([[3, 5]], 6, 9), false, "改动在单元之前");
  assert.equal(touches([[3, 5]], 1, 2), false, "改动在单元之后");
  assert.equal(touches([[1, 2], [8, 8]], 7, 9), true, "多段取任一");
});

test("排序：CRAP 高在前，CRAP 0 仍在无覆盖之前，同 CRAP 看圈复杂度，再文件与行", () => {
  const rows = [
    { name: "a", crap: null, cyclomatic: 9, path: "b.ts", startLine: 1 },
    { name: "b", crap: 5, cyclomatic: 2, path: "b.ts", startLine: 10 },
    { name: "c", crap: 5, cyclomatic: 4, path: "a.ts", startLine: 1 },
    { name: "d", crap: 5, cyclomatic: 2, path: "a.ts", startLine: 3 },
    { name: "e", crap: 5, cyclomatic: 2, path: "a.ts", startLine: 1 },
    { name: "f", crap: 30, cyclomatic: 1, path: "z.ts", startLine: 1 },
    { name: "g", crap: 0, cyclomatic: 1, path: "a.ts", startLine: 1 },
  ];
  assert.deepEqual([...rows].sort(byHotness).map((r) => r.name), ["f", "c", "e", "d", "b", "g", "a"]);
  assert.ok(byHotness(rows[5], rows[1]) < 0);
  assert.ok(byHotness(rows[1], rows[5]) > 0);
  assert.ok(byHotness(rows[6], rows[0]) < 0, "CRAP 0 在无覆盖之前");
  assert.ok(byHotness(rows[0], rows[6]) > 0, "无覆盖在 CRAP 0 之后");
  const at = (cyclomatic, path, startLine) => ({ crap: 5, cyclomatic, path, startLine });
  assert.ok(byHotness(at(4, "a.ts", 5), at(2, "a.ts", 1)) < 0, "圈复杂度高在前，不看行号");
  assert.ok(byHotness(at(2, "a.ts", 5), at(2, "b.ts", 1)) < 0, "文件名在前，不看行号");
});

test("汇总：CRAP 最高只看有覆盖的函数，全无覆盖时为 null，coverageProvided 看有没有 lcov", () => {
  assert.deepEqual(summarize([{ cyclomatic: 2, cognitive: 1, crap: 4 }, { cyclomatic: 5, cognitive: 7, crap: null }], {}), { count: 2, maxCyclomatic: 5, maxCognitive: 7, maxCrap: 4, coverageProvided: true });
  assert.deepEqual(summarize([{ cyclomatic: 1, cognitive: 0, crap: null }], null), { count: 1, maxCyclomatic: 1, maxCognitive: 0, maxCrap: null, coverageProvided: false });
  assert.equal(summarize([], null).maxCrap, null);
});

test("改动行只算单元自己的行：内层单元的首尾行都不算，第 0 行（不是真实行号）不算，第 1 行算", () => {
  const unit = { startLine: 1, endLine: 10 };
  const nested = [{ startLine: 4, endLine: 6 }];
  assert.equal(touchesOwnLines(unit, nested, [[4, 4]]), false);
  assert.equal(touchesOwnLines(unit, nested, [[6, 6]]), false);
  assert.equal(touchesOwnLines(unit, nested, [[5, 5]]), false);
  assert.equal(touchesOwnLines(unit, nested, [[3, 3]]), true);
  assert.equal(touchesOwnLines(unit, nested, [[7, 7]]), true);
  assert.equal(touchesOwnLines(unit, nested, [[0, 0]]), false);
  assert.equal(touchesOwnLines(unit, nested, [[1, 1]]), true);
  assert.equal(touchesOwnLines(unit, nested, [[10, 10]]), true);
  assert.equal(touchesOwnLines(unit, nested, [[11, 12]]), false);
  assert.equal(touchesOwnLines(unit, nested, [[0, 0], [4, 7]]), true);
});

test("覆盖率三态：没有报告「未提供报告」；报告里没有文件、范围内没有记录都是无数据带原因；有分支取分支，否则取行", () => {
  const unit = { startLine: 3, endLine: 6 };
  const rec = { lines: new Map([[3, [1, 1]], [4, [0, 1]]]), branches: new Map() };
  assert.deepEqual(coverageOf(null, "a.ts", unit, []), { value: null, reason: "未提供报告" });
  assert.deepEqual(coverageOf(new Map([["b.ts", rec]]), "a.ts", unit, []), { value: null, reason: "报告里没有这个文件" });
  assert.deepEqual(coverageOf(new Map([["a.ts", rec]]), "a.ts", { startLine: 10, endLine: 12 }, []), { value: null, reason: "范围内没有记录" });
  assert.deepEqual(coverageOf(new Map([["a.ts", rec]]), "a.ts", unit, []), { value: 0.5, reason: null });
  const branched = { lines: rec.lines, branches: new Map([[3, [1, 4]]]) };
  assert.deepEqual(coverageOf(new Map([["a.ts", branched]]), "a.ts", unit, []), { value: 0.25, reason: null }, "分支优先");
  assert.deepEqual(coverageOf(new Map([["a.ts", { lines: new Map([[3, [0, 1]]]), branches: new Map() }]]), "a.ts", unit, []), { value: 0, reason: null }, "有记录全没命中才是 0");
});

test("表格：没有改动函数时写一行说明；覆盖率写百分比，缺 lcov 写未提供（第五程 C1 起三态，原「无覆盖」）；未覆盖文件列在末尾", () => {
  const base = "abcdef0123456789";
  const empty = formatMetrics({ base, functions: [], uncovered: [], summary: { coverageProvided: false } });
  assert.match(empty, /^结构读数：基线 abcdef012345 到工作树；改动函数 0 个；没有 lcov，CRAP 写无覆盖\n/);
  assert.match(empty, /\| \| 没有改动的函数 \|/);
  const row = { name: "f", path: "a.ts", startLine: 1, endLine: 3, cyclomatic: 2, cognitive: 1, coverage: 0.25, crap: 3.6875 };
  const one = formatMetrics({ base, functions: [row], uncovered: [{ path: "x.md", reason: "r" }], summary: { coverageProvided: true } });
  assert.match(one, /改动函数 1 个\n/);
  assert.match(one, /\| f \| a\.ts \| 1-3 \| 2 \| 1 \| 25% \| 3\.69 \|/);
  assert.doesNotMatch(one, /没有改动的函数/);
  assert.match(one, /\n\n未覆盖的改动文件：\n- x\.md：r$/);
  const none = formatMetrics({ base, functions: [{ ...row, coverage: null, crap: null }], uncovered: [], summary: { coverageProvided: false } });
  assert.match(none, /\| 未提供 \| 无覆盖 \|/);
  const nodata = formatMetrics({ base, functions: [{ ...row, coverage: null, coverageReason: "报告里没有这个文件", crap: null }], uncovered: [], summary: { coverageProvided: true } });
  assert.match(nodata, /\| 无数据 \| 无覆盖 \|/);
  const banded = formatMetrics({ base, functions: [{ ...row, band: "warn" }], uncovered: [], summary: { coverageProvided: true } });
  assert.match(banded, /\| CRAP \| 带位 \|\n\| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \|\n\| f \| a\.ts \| 1-3 \| 2 \| 1 \| 25% \| 3\.69 \| warn \|/);
});

test("带位：严格大于才过线；CRAP 算不出时只看圈复杂度，都没过线记无覆盖；--cc 与 --crap 覆盖缺省线", () => {
  const t = DEFAULT_THRESHOLDS;
  assert.deepEqual(t, { cyclomaticWarn: 10, cyclomaticAlert: 12, crapAlert: 30 });
  assert.equal(bandOf(10, 10, t), "ok");
  assert.equal(bandOf(11, 11, t), "warn");
  assert.equal(bandOf(12, 12, t), "warn");
  assert.equal(bandOf(13, 13, t), "alert");
  assert.equal(bandOf(3, 31, t), "alert");
  assert.equal(bandOf(3, 30, t), "ok");
  assert.equal(bandOf(3, null, t), "无覆盖");
  assert.equal(bandOf(11, null, t), "warn");
  assert.equal(bandOf(13, null, t), "alert");
  assert.deepEqual(parseThresholds(undefined, undefined), t);
  assert.deepEqual(parseThresholds("5,8", "20.5"), { cyclomaticWarn: 5, cyclomaticAlert: 8, crapAlert: 20.5 });
  assert.equal(bandOf(6, 1, parseThresholds("5,8", undefined)), "warn");
  assert.throws(() => parseThresholds("8,5", undefined), /warn 不大于 alert/);
  assert.deepEqual(parseThresholds("5,5", undefined).cyclomaticAlert, 5, "warn 等于 alert 允许");
  assert.throws(() => parseThresholds("x", undefined), /--cc 要写成/);
  assert.throws(() => parseThresholds(undefined, "many"), /--crap 要是一个数/);
});

const SRC = `export function f(a: number) {
  if (a > 0) return 1;
  return 0;
}
export function g(b: number) {
  if (b > 0) return 1;
  return 0;
}
`;
const run = (dir, args) => spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--format", "json", ...args], { encoding: "utf8" });

test("--scope 只收前缀内的文件；node_modules 不收；只删了行的函数也算改动（第四程 C11 改掉了第三程的「不算」）", { skip }, () => {
  const dir = makeRepo({ "src/a.ts": SRC, "lib/b.ts": SRC });
  try {
    const changedF = SRC.replace("return 0;\n}\nexport function g", "return 2;\n}\nexport function g");
    writeFiles(dir, { "src/a.ts": changedF, "lib/b.ts": changedF, "lib/node_modules/dep/index.ts": changedF });
    const scoped = run(dir, ["--scope", "lib/"]);
    assert.equal(scoped.status, 0, scoped.stderr);
    assert.deepEqual(JSON.parse(scoped.stdout).functions.map((x) => [x.path, x.name]), [["lib/b.ts", "f"]]);
    writeFiles(dir, { "src/a.ts": SRC.replace("  if (b > 0) return 1;\n", ""), "lib/b.ts": SRC });
    const deleted = run(dir, []);
    assert.equal(deleted.status, 0, deleted.stderr);
    assert.deepEqual(JSON.parse(deleted.stdout).functions.map((x) => [x.path, x.name, x.changedLines]), [["src/a.ts", "g", [[5, 6]]]]);
  } finally { dispose(dir); }
});
