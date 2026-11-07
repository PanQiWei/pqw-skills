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
