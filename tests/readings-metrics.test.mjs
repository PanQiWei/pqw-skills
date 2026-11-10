// 结构读数的四处口径：同名单元配基线、CRAP 两条线、断言的认法、多份覆盖文件合并。
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { makeRepo, writeFiles, dispose, tsPath, git } from "./fixture.mjs";
import { bandOf, parseThresholds, collectMetrics, formatMetrics } from "../skills/slice-closeout/scripts/lib/metrics.mjs";
import { TEST_FILE_RE } from "../skills/slice-closeout/scripts/lib/core.mjs";
import { loadTypescript, testsWithoutAssertions } from "../skills/slice-closeout/scripts/lib/adapter-typescript.mjs";

const SCRIPT = new URL("../skills/slice-closeout/scripts/metrics.mjs", import.meta.url).pathname;
const TS = tsPath();
const skip = TS ? false : "没有 typescript，设 PQW_TS";
const run = (dir, args) => spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--format", "json", ...args], { encoding: "utf8" });

// ---- 1. 同名单元配基线

/** 一个工厂里两个匿名对象字面量各有一个 derive：限定名都是 make.derive。大的那个圈复杂度 11，小的 1。 */
const IFS = Array.from({ length: 10 }, (_, i) => `    if (x > ${i + 1}) x += 1;`).join("\n");
const SAME_NAME = `export function make(flag: number) {
  if (flag > 0) return { derive(x: number) {
${IFS}
    return x;
  } };
  return { derive(x: number) { return x; } };
}
`;
const BIG_DERIVE_ONE_LINE = `  if (flag < 0) return { derive(x: number) { return ${Array.from({ length: 10 }, (_, i) => `x > ${i + 1}`).join(" && ")} ? 1 : 0; } };\n`;

test.skipIf(skip)("同名单元：按名字加序号配基线，主体不再配到一行转接上报假的变差；个数对不上时按行区间重叠配，仍配不上的记「拿不准」、不报变差并单列", () => {
  const dir = makeRepo({ "src/make.ts": SAME_NAME });
  try {
    writeFiles(dir, { "src/make.ts": SAME_NAME.replace("    return x;\n", "    return x + 0;\n") });
    const same = JSON.parse(run(dir, []).stdout).functions.filter((f) => f.name === "make.derive");
    assert.deepEqual(same.map((f) => [f.startLine, f.cyclomatic, f.baseline?.cyclomatic, f.trend, f.worse]), [[2, 11, 11, "same", false]], "主体配到基线的主体：11 → 11，不是 1 → 11");

    writeFiles(dir, { "src/make.ts": SAME_NAME.replace("    return x;\n", "    return x + 0;\n").replace("  return { derive(x: number) { return x; } };\n", `  return { derive(x: number) { return x; } };\n${BIG_DERIVE_ONE_LINE}`) });
    const out = JSON.parse(run(dir, []).stdout);
    const derives = out.functions.filter((f) => f.name === "make.derive").sort((a, b) => a.startLine - b.startLine);
    assert.deepEqual(derives.map((f) => [f.startLine, f.cyclomatic, f.trend, f.worse]), [[2, 11, "same", false], [16, 11, "unsure", false]], "现在 3 个、基线 2 个：主体按行重叠配上；新加的那个与基线哪个都不重叠，拿不准，不报变差");
    assert.equal(derives[1].baseline, null);
    assert.deepEqual(out.summary.explain, [], "拿不准的不进要交代的变差");
    assert.deepEqual(out.summary.unsure, ["make.derive"]);
    const table = spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD"], { encoding: "utf8" }).stdout;
    assert.match(table, /\| make\.derive \| src\/make\.ts \| 16-16 \| 11 \|[^\n]*\| 拿不准 \|  \|\n/);
    assert.match(table, /\n\n拿不准的基线（同名单元配不上，不报变差）：\n- src\/make\.ts:16 make\.derive\n/);
  } finally { dispose(dir); }
});

// ---- 2. CRAP 两条线

test("CRAP 两条线：--crap <warn>,<alert> 与 --cc 同形；只给一个数时当 alert，不出 warn 线，缺省不变", () => {
  const t = parseThresholds(undefined, "10,12");
  assert.deepEqual(t, { cyclomaticWarn: 10, cyclomaticAlert: 12, crapWarn: 10, crapAlert: 12 });
  assert.equal(bandOf(2, 10.8, t), "warn", "CC 低但 CRAP 过了提醒线");
  assert.equal(bandOf(2, 12.5, t), "alert");
  assert.equal(bandOf(2, 10, t), "ok", "严格大于才过线");
  assert.equal(bandOf(11, 3, t), "warn", "圈复杂度的线照旧");
  assert.deepEqual(parseThresholds(undefined, "30"), { cyclomaticWarn: 10, cyclomaticAlert: 12, crapAlert: 30 }, "一个数当 alert，没有 crapWarn");
  assert.equal(bandOf(2, 29, parseThresholds(undefined, "30")), "ok");
  assert.throws(() => parseThresholds(undefined, "12,10"), /--crap 要是一个数，或写成 <warn>,<alert> 且 warn 不大于 alert：12,10/);
  assert.throws(() => parseThresholds(undefined, "a,b"), /--crap 要是一个数/);
});

// ---- 3. 断言的认法

const TYPE_TESTS = `import { test, expect, expectTypeOf, assertType } from "vitest";
import assert from "node:assert/strict";
import { f } from "./f";

function checks(x: number) { expect(x).toBe(1); }
const viaArrow = (x: number) => { assert.ok(x); };
function noop(x: number) { return x; }
function deep(x: number) { checks(x); }

test("类型", () => { expectTypeOf(f).toBeFunction(); });
test("assertType", () => { assertType<number>(f(1)); });
test("ts-expect-error", () => {
  // @ts-expect-error 参数类型不对
  f("x");
});
test("辅助函数", () => { checks(f(1)); });
test("箭头辅助", () => { viaArrow(f(1)); });
test("没断言的辅助", () => { noop(f(1)); });
test("两层", () => { deep(f(1)); });
test("只调用", () => { f(1); });
`;

test.skipIf(skip)("断言的认法：类型测试文件按测试文件读，里面 expectTypeOf、assertType 与 @ts-expect-error 算断言；调用同一文件里有断言的辅助函数算有断言，只解一层", () => {
  for (const p of ["src/a.test-d.ts", "src/a.spec-d.ts", "src/a.test-d.mts"]) assert.equal(TEST_FILE_RE.test(p), true, p);
  assert.equal(TEST_FILE_RE.test("src/a-d.ts"), false);
  const ts = loadTypescript(TS);
  const names = (path) => testsWithoutAssertions(ts, path, TYPE_TESTS).map((t) => t.name);
  assert.deepEqual(names("t/a.test-d.ts"), ["没断言的辅助", "两层", "只调用"]);
  assert.deepEqual(names("t/a.test.ts"), ["类型", "assertType", "ts-expect-error", "没断言的辅助", "两层", "只调用"], "普通测试文件里类型断言不算；辅助函数照样解一层");

  const dir = makeRepo({ "src/f.ts": "export function f(x: number) {\n  return x;\n}\n", "src/f.test-d.ts": 'import { test } from "vitest";\n' });
  try {
    writeFiles(dir, { "src/f.test-d.ts": 'import { test, expectTypeOf } from "vitest";\nimport { f } from "./f";\n\ntest("有类型断言", () => { expectTypeOf(f).toBeFunction(); });\ntest("没有", () => { f(1); });\n' });
    const head = git(dir, "rev-parse HEAD");
    const r = collectMetrics({ root: dir, base: head, head, ts, report: null, scope: null });
    assert.deepEqual(r.uncovered, [{ path: "src/f.test-d.ts", reason: "测试文件不度量" }]);
    assert.deepEqual(r.testsWithoutAssertions, [{ file: "src/f.test-d.ts", name: "没有", line: 5 }]);
  } finally { dispose(dir); }
});

// ---- 4. 多份覆盖文件

const SRC = "export function f(x: number) {\n  if (x > 0) return 1;\n  return 0;\n}\n";

test.skipIf(skip)("多份覆盖文件：--lcov a,b,c 合并；每份里的相对路径按它自己所在的目录解析（文件不在那里时往上找）；同一源文件取各行、各分支覆盖的并", () => {
  const dir = makeRepo({ "packages/a/src/index.ts": SRC, "packages/b/src/index.ts": SRC });
  try {
    writeFiles(dir, {
      "packages/a/src/index.ts": SRC.replace("return 0;", "return -1;"),
      "packages/b/src/index.ts": SRC.replace("return 0;", "return -1;"),
    });
    writeFiles(dir, {
      "packages/a/lcov.info": "SF:src/index.ts\nDA:1,1\nDA:2,1\nDA:3,0\nBRDA:2,0,0,1\nBRDA:2,0,1,0\nend_of_record\n",
      "packages/a/other/lcov.info": "SF:../src/index.ts\nDA:3,1\nBRDA:2,0,0,0\nBRDA:2,0,1,1\nend_of_record\n",
      "packages/b/coverage/lcov.info": "SF:src/index.ts\nDA:1,1\nDA:2,0\nDA:3,0\nBRDA:2,0,0,0\nBRDA:2,0,1,0\nend_of_record\n",
    });
    const r = run(dir, ["--lcov", "packages/a/lcov.info,packages/a/other/lcov.info,packages/b/coverage/lcov.info"]);
    assert.equal(r.status, 0, r.stderr);
    const got = JSON.parse(r.stdout).functions.map((f) => [f.path, f.coverage, f.coverageReason]).sort();
    assert.deepEqual(got, [["packages/a/src/index.ts", 1, null], ["packages/b/src/index.ts", 0, null]], "a 的两个分支各在一份里命中，并起来 2/2；b 的 src/index.ts 不与 a 的混，不记多个文件匹配");
  } finally { dispose(dir); }
});
