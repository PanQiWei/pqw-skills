// 改动行的取法：大 diff 不崩、范围作为 pathspec 交给 git、覆盖率报告目录不算改动文件。
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeRepo, writeFiles, dispose } from "./fixture.mjs";
import { changedLines, changedPaths, diffPrefixes } from "../skills/slice-closeout/scripts/lib/core.mjs";

const lines = (n, word) => Array.from({ length: n }, (_, i) => `${word} ${i} 填充填充填充填充填充填充填充填充\n`).join("");
const SMALL = "export function f() {\n  return 1;\n}\n";

test("diff 超过 1 MB 也跑得通：整个仓库的改动行取全，不报 ENOBUFS", () => {
  const dir = makeRepo({ "big/data.txt": lines(40000, "old"), "src/a.ts": SMALL });
  try {
    writeFiles(dir, { "big/data.txt": lines(40000, "new"), "src/a.ts": SMALL.replace("1", "2") });
    const size = Buffer.byteLength(execFileSync("git", ["diff", "-U0", "HEAD"], { cwd: dir, encoding: "utf8", maxBuffer: 1 << 30 }));
    assert.ok(size > 1024 * 1024, `夹具的 diff 要超过 1 MB，实际 ${size}`);
    const result = changedLines(dir, "HEAD");
    assert.deepEqual([...result.keys()].sort(), ["big/data.txt", "src/a.ts"]);
    assert.deepEqual(result.get("big/data.txt"), [[1, 40000]]);
    assert.deepEqual(result.get("src/a.ts"), [[2, 2]]);
  } finally { dispose(dir); }
});

test("给了范围时只对范围取 diff：结果只含范围内文件，范围作为 pathspec 交给 git", () => {
  const dir = makeRepo({ "big/data.txt": lines(40000, "old"), "src/a.ts": SMALL, "src/b.ts": SMALL, "docs/d.md": "x\n" });
  const traceDir = mkdtempSync(join(tmpdir(), "pqw-trace-"));
  const trace = join(traceDir, "git.log");
  const saved = process.env.GIT_TRACE;
  try {
    writeFiles(dir, { "big/data.txt": lines(40000, "new"), "src/a.ts": SMALL.replace("1", "2"), "docs/d.md": "y\n", "src/new.ts": "export const n = 1;\n", "other/new.ts": "export const m = 1;\n" });
    process.env.GIT_TRACE = trace;
    const result = changedLines(dir, "HEAD", ["src/"]);
    assert.deepEqual([...result.keys()].sort(), ["src/a.ts", "src/new.ts"], "已跟踪与未跟踪的范围外文件都不收");
    const log = readFileSync(trace, "utf8");
    assert.match(log, /diff -U0 .*-- .*src\/\*/, "diff 带 pathspec");
    assert.match(log, /ls-files --others --exclude-standard -- .*src\/\*/, "未跟踪文件的列表也带 pathspec");
    assert.deepEqual([...changedLines(dir, "HEAD", []).keys()], [], "范围为空数组表示没有任何路径在范围里，不是不限范围");
  } finally {
    if (saved === undefined) delete process.env.GIT_TRACE; else process.env.GIT_TRACE = saved;
    rmSync(traceDir, { recursive: true, force: true });
    dispose(dir);
  }
});

test("范围是字符串前缀而不是目录：半截名照样命中，通配符按字面", () => {
  const dir = makeRepo({ "src/calc.ts": SMALL, "src/cost.ts": SMALL, "lib[a]/x.ts": SMALL, "libb/x.ts": SMALL });
  try {
    writeFiles(dir, { "src/calc.ts": SMALL.replace("1", "2"), "src/cost.ts": SMALL.replace("1", "2"), "lib[a]/x.ts": SMALL.replace("1", "2"), "libb/x.ts": SMALL.replace("1", "2") });
    assert.deepEqual([...changedLines(dir, "HEAD", ["src/ca"]).keys()], ["src/calc.ts"]);
    assert.deepEqual([...changedLines(dir, "HEAD", ["lib[a]/"]).keys()], ["lib[a]/x.ts"], "方括号不当通配符");
    assert.deepEqual([...changedLines(dir, "HEAD", ["src/ca", "libb"]).keys()].sort(), ["libb/x.ts", "src/calc.ts"]);
  } finally { dispose(dir); }
});

test("覆盖率报告目录不算改动文件：任意层级的 coverage/ 下未跟踪的排除；已跟踪的是源码，照常算；名字里只带 coverage 的不排除", () => {
  const dir = makeRepo({ "src/a.ts": SMALL, "packages/a/coverage/tracked.js": "var a = 1;\n" });
  try {
    writeFiles(dir, {
      "packages/a/coverage/tracked.js": "var a = 2;\n",
      "coverage/prettify.js": "function p() { return 1; }\n",
      "packages/a/coverage/lcov-report/prettify.js": "function p() { return 1; }\n",
      "src/coverage.ts": SMALL,
      "src/coverage-tools/x.ts": SMALL,
      "src/a.ts": SMALL.replace("1", "2"),
    });
    const expected = ["packages/a/coverage/tracked.js", "src/a.ts", "src/coverage-tools/x.ts", "src/coverage.ts"];
    assert.deepEqual([...changedLines(dir, "HEAD").keys()].sort(), expected);
    assert.deepEqual(changedPaths(dir, "HEAD").sort(), expected);
  } finally { dispose(dir); }
});

test("只取文件名：已跟踪的改动、删除与未跟踪的文件都在，范围内才收", () => {
  const dir = makeRepo({ "src/a.ts": SMALL, "src/gone.ts": SMALL, "docs/d.md": "x\n" });
  try {
    writeFiles(dir, { "src/a.ts": SMALL.replace("1", "2"), "docs/d.md": "y\n", "src/new.ts": SMALL });
    execFileSync("git", ["rm", "-q", "src/gone.ts"], { cwd: dir });
    assert.deepEqual(changedPaths(dir, "HEAD").sort(), ["docs/d.md", "src/a.ts", "src/gone.ts", "src/new.ts"]);
    assert.deepEqual(changedPaths(dir, "HEAD", ["src/"]).sort(), ["src/a.ts", "src/gone.ts", "src/new.ts"]);
    assert.deepEqual(changedPaths(dir, "HEAD", []), []);
  } finally { dispose(dir); }
});

test("diffPrefixes：scope 与成员前缀取交，没有任何限制返回 null，两者不相交返回空数组", () => {
  assert.equal(diffPrefixes(null, ""), null);
  assert.deepEqual(diffPrefixes(["a/", "b"], ""), ["a/", "b"]);
  assert.deepEqual(diffPrefixes(null, "packages/a"), ["packages/a/"]);
  assert.deepEqual(diffPrefixes(["packages/a/src", "packages/b", "pack"], "packages/a"), ["packages/a/src", "packages/a/"]);
  assert.deepEqual(diffPrefixes(["packages/b"], "packages/a"), []);
  assert.deepEqual(diffPrefixes(["packages/a/x", "packages/a/x"], "packages/a"), ["packages/a/x"], "去重");
});
