import { test } from "vitest";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, writeFiles, dispose, tsPath, git } from "./fixture.mjs";

const SCRIPT = new URL("../skills/slice-closeout/scripts/metrics.mjs", import.meta.url).pathname;
const TS = tsPath();
const run = (dir, args) => spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, ...args], { encoding: "utf8" });

const BASE = `export function f(a: number, b: number) {
  if (a > 0 && b > 0) return a + b;
  return 0;
}
export function g(x?: string) {
  return x ?? "none";
}
export function outer(xs: number[]) {
  function inner(y: number) {
    return y > 1 ? y : 0;
  }
  return xs.map(inner);
}
`;

test("纯删除也算改动：删掉函数里一行 if 后读数含该函数", { skip: TS ? false : "没有 typescript" }, () => {
  const dir = makeRepo({ "src/a.ts": BASE });
  try {
    writeFiles(dir, { "src/a.ts": BASE.replace("  if (a > 0 && b > 0) return a + b;\n", "") });
    const r = run(dir, ["--base", "HEAD", "--format", "json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.functions.map((f) => f.name), ["f"]);
    assert.deepEqual(out.functions[0].changedLines, [[1, 2]]);
    writeFiles(dir, { "src/a.ts": BASE, "src/d.ts": "const a = 1;\nexport function d() {\n  return a > 0 ? a : 0;\n}\n" });
    git(dir, "add -A");
    git(dir, "commit -q -m d");
    writeFiles(dir, { "src/d.ts": "export function d() {\n  return a > 0 ? a : 0;\n}\n" });
    const head = JSON.parse(run(dir, ["--base", "HEAD", "--format", "json"]).stdout);
    assert.deepEqual(head.functions.map((f) => [f.name, f.changedLines]), [["d", [[1, 2]]]], "文件头删除记第 1、2 行");
  } finally { dispose(dir); }
});

test("显式基线不是 HEAD 的祖先时改用合并点：抬头写明，JSON 记 baseGiven，不含基线分支后来改的文件", { skip: TS ? false : "没有 typescript" }, () => {
  const dir = makeRepo({ "src/a.ts": BASE });
  try {
    const root = git(dir, "rev-parse HEAD");
    git(dir, "checkout -q -b work");
    writeFiles(dir, { "src/a.ts": BASE.replace("return 0;", "return -1;") });
    git(dir, "commit -q -am change");
    git(dir, "checkout -q main");
    writeFiles(dir, { "src/m.ts": "export function m(x: number) {\n  return x > 1 ? x : 0;\n}\n" });
    git(dir, "add -A");
    git(dir, "commit -q -m advance");
    git(dir, "checkout -q work");
    const r = run(dir, ["--base", "main", "--format", "json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.base, root);
    assert.equal(out.baseGiven, git(dir, "rev-parse main"));
    assert.deepEqual(out.functions.map((f) => f.name), ["f"]);
    const table = run(dir, ["--base", "main"]);
    assert.match(table.stdout, new RegExp(`^结构读数：基线 ${root.slice(0, 12)}（给的 ${out.baseGiven.slice(0, 12)} 不是 HEAD 的祖先，改用合并点） 到工作树`));
    const plain = JSON.parse(run(dir, ["--base", "HEAD", "--format", "json"]).stdout);
    assert.equal(plain.baseGiven, git(dir, "rev-parse HEAD"), "祖先时 baseGiven 等于 base");
    assert.equal(plain.base, plain.baseGiven);
  } finally { dispose(dir); }
});

test("读数只认 --repo：GIT_DIR 指向别的仓库也不受影响", { skip: TS ? false : "没有 typescript" }, () => {
  const dir = makeRepo({ "src/a.ts": BASE });
  const other = makeRepo({ "README.md": "other\n" });
  try {
    writeFiles(dir, { "src/a.ts": BASE.replace("return 0;", "return -1;") });
    const env = { ...process.env, GIT_DIR: join(other, ".git"), GIT_WORK_TREE: other };
    const r = spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--format", "json"], { encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.head, git(dir, "rev-parse HEAD"));
    assert.deepEqual(out.functions.map((f) => f.name), ["f"]);
  } finally { dispose(dir); dispose(other); }
});

test("测试文件与声明文件不度量，列进未覆盖带原因；报告里没有的文件与范围内没记录的函数覆盖率为 null 带原因，表格写无数据", { skip: TS ? false : "没有 typescript" }, () => {
  const dir = makeRepo({ "src/a.ts": BASE, "src/b.ts": BASE, "tests/a.test.ts": "import { test } from 'node:test';\ntest('x', () => { if (1) {} });\n", "src/t.d.ts": "export declare function f(a: number): number;\n" });
  try {
    writeFiles(dir, {
      "src/a.ts": BASE.replace("return 0;", "return -1;"),
      "src/b.ts": BASE.replace("return 0;", "return 2;"),
      "tests/a.test.ts": "import { test } from 'node:test';\ntest('x', () => { if (2) {} });\n",
      "src/t.d.ts": "export declare function f(a: number, b: number): number;\n",
      "lcov.info": "SF:src/a.ts\nDA:20,1\nend_of_record\n",
    });
    const r = run(dir, ["--base", "HEAD", "--lcov", "lcov.info", "--format", "json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.uncovered.filter((u) => u.path !== "lcov.info"), [{ path: "src/t.d.ts", reason: "声明文件不度量" }, { path: "tests/a.test.ts", reason: "测试文件不度量" }]);
    const byPath = Object.fromEntries(out.functions.map((f) => [f.path, [f.coverage, f.coverageReason, f.crap]]));
    assert.deepEqual(byPath, { "src/a.ts": [null, "范围内没有记录", null], "src/b.ts": [null, "报告里没有这个文件", null] });
    const table = run(dir, ["--base", "HEAD", "--lcov", "lcov.info"]);
    assert.match(table.stdout, /\| f \| src\/a\.ts \| 1-4 \| 3 \| 2 \| 无数据 \| 无覆盖 \| 无覆盖 \|/);
    assert.match(table.stdout, /- tests\/a\.test\.ts：测试文件不度量/);
  } finally { dispose(dir); }
});

test("与基线比：存量大函数只改一行不变差，新出现的过线函数变差排第一，涨了但没过线不变差；表末一行；新文件里全部 new", { skip: TS ? false : "没有 typescript" }, () => {
  const chain = (n, name) => `export function ${name}(a: number) {\n${Array.from({ length: n }, (_, i) => `  if (a === ${i}) return ${i};`).join("\n")}\n  return -1;\n}\n`;
  const dir = makeRepo({ "src/a.ts": BASE + chain(10, "big") });
  try {
    writeFiles(dir, { "src/a.ts": BASE.replace("return a + b;", "return a + b;").replace("if (a > 0 && b > 0)", "if (a > 0 && b > 0 && a !== b)") + chain(10, "big").replace("return -1;", "return -2;") + chain(10, "fresh"), "src/n.ts": chain(2, "tiny") });
    const r = run(dir, ["--base", "HEAD", "--format", "json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    const by = Object.fromEntries(out.functions.map((f) => [f.name, [f.cyclomatic, f.baseline, f.trend, f.worse, f.band]]));
    assert.deepEqual(by.big, [11, { cyclomatic: 11, cognitive: 10 }, "same", false, "warn"]);
    assert.deepEqual(by.fresh, [11, null, "new", true, "warn"]);
    assert.deepEqual(by.f, [4, { cyclomatic: 3, cognitive: 2 }, "up", false, "无覆盖"]);
    assert.deepEqual(by.tiny, [3, null, "new", false, "无覆盖"]);
    assert.equal(out.functions[0].name, "fresh", "变差的排第一");
    assert.deepEqual([out.summary.explain, out.summary.overLineNotWorse], [["fresh"], 1]);
    const table = run(dir, ["--base", "HEAD"]);
    assert.match(table.stdout, /\| fresh \| src\/a\.ts \| \d+-\d+ \| 11 \| 10 \| 未提供 \| 无覆盖 \| warn \| 新 → 11 \| ! \|\n/);
    assert.match(table.stdout, /\| big \| src\/a\.ts \| \d+-\d+ \| 11 \| 10 \| 未提供 \| 无覆盖 \| warn \| 11 → 11 \|  \|\n/);
    assert.match(table.stdout, /\n要交代 1 个变差；另有 1 个过线但没有变差，照列不解释\n/);
  } finally { dispose(dir); }
});

test("覆盖率报告的可信度警告：报告早于改动文件；改动函数全部零命中；多个文件匹配", { skip: TS ? false : "没有 typescript" }, () => {
  const dir = makeRepo({ "src/a.ts": BASE });
  try {
    writeFiles(dir, { "src/a.ts": BASE.replace("return 0;", "return -1;"), "lcov.info": "SF:src/a.ts\nDA:2,0\nDA:3,0\nend_of_record\n" });
    const old = new Date("2000-01-01T00:00:00Z");
    utimesSync(join(dir, "lcov.info"), old, old);
    const r = run(dir, ["--base", "HEAD", "--lcov", "lcov.info", "--format", "json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.warnings, ["覆盖率报告早于改动文件 src/a.ts，行号可能错位", "改动函数在报告里全部零命中，可能没跑到或报告过旧"]);
    assert.equal(out.functions[0].coverage, 0);
    const table = run(dir, ["--base", "HEAD", "--lcov", "lcov.info"]);
    assert.match(table.stdout, /改动函数 1 个\n警告：覆盖率报告早于改动文件 src\/a\.ts，行号可能错位\n警告：改动函数在报告里全部零命中，可能没跑到或报告过旧\n\| 函数/);
    writeFiles(dir, { "lcov.info": "SF:x/src/a.ts\nDA:2,1\nend_of_record\nSF:y/src/a.ts\nDA:2,1\nend_of_record\n" });
    const amb = JSON.parse(run(dir, ["--base", "HEAD", "--lcov", "lcov.info", "--format", "json"]).stdout);
    assert.deepEqual(amb.warnings, ["报告里多个文件匹配 src/a.ts，没有取任何一个"]);
    assert.deepEqual([amb.functions[0].coverage, amb.functions[0].coverageReason], [null, "报告里多个文件匹配"]);
    const fresh = JSON.parse(run(dir, ["--base", "HEAD", "--format", "json"]).stdout);
    assert.deepEqual(fresh.warnings, [], "没给报告不警告");
  } finally { dispose(dir); }
});

test("读数 JSON 记实际用的线与每个函数的带位；--cc 与 --crap 可覆盖；格式错退出 2（第五程改：没给 lcov 的覆盖率列写「未提供」）", { skip: TS ? false : "没有 typescript" }, () => {
  const dir = makeRepo({ "src/a.ts": BASE });
  try {
    writeFiles(dir, { "src/a.ts": BASE.replace("return 0;", "return -1;") });
    const plain = JSON.parse(run(dir, ["--base", "HEAD", "--format", "json"]).stdout);
    assert.deepEqual(plain.thresholds, { cyclomaticWarn: 10, cyclomaticAlert: 12, crapAlert: 30 });
    assert.deepEqual(plain.functions.map((f) => [f.name, f.cyclomatic, f.band]), [["f", 3, "无覆盖"]]);
    const low = JSON.parse(run(dir, ["--base", "HEAD", "--format", "json", "--cc", "1,2", "--crap", "5"]).stdout);
    assert.deepEqual(low.thresholds, { cyclomaticWarn: 1, cyclomaticAlert: 2, crapAlert: 5 });
    assert.equal(low.functions[0].band, "alert");
    assert.equal(JSON.parse(run(dir, ["--base", "HEAD", "--format", "json", "--cc", "2,5"]).stdout).functions[0].band, "warn");
    const table = run(dir, ["--base", "HEAD", "--cc", "1,2"]);
    assert.match(table.stdout, /\| f \| src\/a\.ts \| 1-4 \| 3 \| 2 \| 未提供 \| 无覆盖 \| alert \|/);
    const bad = run(dir, ["--base", "HEAD", "--cc", "x"]);
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /--cc 要写成 <warn>,<alert>/);
  } finally { dispose(dir); }
});

test("--help 退出 0", () => {
  const r = spawnSync("node", [SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
});

test("没有 typescript 时退出 2 并写「未提供」", () => {
  const dir = makeRepo({ "src/a.ts": BASE });
  try {
    const r = spawnSync("node", [SCRIPT, "--repo", dir, "--ts", join(dir, "nope"), "--base", "HEAD"], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /未提供/);
  } finally { dispose(dir); }
});

test("只摘改动函数：圈复杂度、认知复杂度，无 lcov 时 CRAP 为无覆盖", { skip: TS ? false : "没有 typescript，设 PQW_TS" }, () => {
  const dir = makeRepo({ "src/a.ts": BASE, "README.md": "x\n" });
  try {
    writeFiles(dir, { "src/a.ts": BASE.replace("return a + b;", "return a + b + 1;").replace("y > 1 ? y : 0", "y > 1 ? y : -1"), "README.md": "y\n" });
    const r = run(dir, ["--base", "HEAD", "--format", "json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    const names = out.functions.map((f) => f.name).sort();
    assert.deepEqual(names, ["f", "outer.inner"]);
    const f = out.functions.find((x) => x.name === "f");
    assert.equal(f.cyclomatic, 3);
    assert.equal(f.cognitive, 2);
    assert.equal(f.coverage, null);
    assert.equal(f.crap, null);
    const inner = out.functions.find((x) => x.name === "outer.inner");
    assert.equal(inner.cyclomatic, 2);
    assert.deepEqual(out.uncovered, [{ path: "README.md", reason: "不是 TypeScript 或 JavaScript 源码" }]);
    const table = run(dir, ["--base", "HEAD"]);
    assert.match(table.stdout, /\| f \|/);
    assert.match(table.stdout, /无覆盖/);
  } finally { dispose(dir); }
});

test("有 lcov 时给覆盖率与 CRAP；?? 与 ?. 计入判定", { skip: TS ? false : "没有 typescript" }, () => {
  const dir = makeRepo({ "src/a.ts": BASE });
  try {
    writeFiles(dir, { "src/a.ts": BASE.replace('x ?? "none"', 'x?.trim() ?? "none"') });
    const lcov = `SF:src/a.ts\nDA:5,1\nDA:6,0\nend_of_record\n`;
    writeFileSync(join(dir, "lcov.info"), lcov);
    const r = run(dir, ["--base", "HEAD", "--lcov", "lcov.info", "--format", "json"]);
    assert.equal(r.status, 0, r.stderr);
    const g = JSON.parse(r.stdout).functions.find((x) => x.name === "g");
    assert.equal(g.cyclomatic, 3);
    assert.equal(g.coverage, 0.5);
    assert.equal(g.crap, 3 * 3 * 0.125 + 3);
  } finally { dispose(dir); }
});

test("基线缺省取与目标分支的合并点", { skip: TS ? false : "没有 typescript" }, () => {
  const dir = makeRepo({ "src/a.ts": BASE });
  try {
    git(dir, "checkout -q -b work");
    writeFiles(dir, { "src/a.ts": BASE.replace("return 0;", "return -1;") });
    git(dir, "commit -q -am change");
    const r = run(dir, ["--format", "json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.base, git(dir, "rev-parse main"));
    assert.deepEqual(out.functions.map((f) => f.name), ["f"]);
  } finally { dispose(dir); }
});
