import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
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

test("读数 JSON 记实际用的线与每个函数的带位；--cc 与 --crap 可覆盖；格式错退出 2", { skip: TS ? false : "没有 typescript" }, () => {
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
    assert.match(table.stdout, /\| f \| src\/a\.ts \| 1-4 \| 3 \| 2 \| 无覆盖 \| 无覆盖 \| alert \|/);
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
