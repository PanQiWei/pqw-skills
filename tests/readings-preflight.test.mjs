// 真起 Stryker 的两处口径：沙箱预检、超时复核上限。没有 Stryker 模块时跳过。
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { makeVitestRepo, writeFiles, dispose, tsPath, strykerModules, git, VITEST_SRC } from "./fixture.mjs";
import { workDir } from "../skills/slice-closeout/scripts/lib/stryker.mjs";

const SCRIPT = new URL("../skills/slice-closeout/scripts/mutation.mjs", import.meta.url).pathname;
const TS = tsPath();
const MODULES = strykerModules();
const skipReal = !TS ? "没有 typescript，设 PQW_TS" : MODULES ? false : "没有 Stryker 模块，设 PQW_STRYKER_MODULES";
const strykerRun = (dir, args) => spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", ...args], { encoding: "utf8", env: { ...process.env, PQW_STRYKER_MODULES: "/nonexistent/modules" } });

/** 只在工作树里能加载的用例文件：沙箱不复制 .git，模块顶层就抛错。unused 只有它守着。 */
const GUARD_TEST = `import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { unused } from "../src/calc";

if (!existsSync(new URL("../.git", import.meta.url))) throw new Error("只在工作树里能加载");

test("unused", () => {
  expect(unused(1, 2)).toBe(3);
});
`;

test.skipIf(skipReal)("沙箱预检：用例文件只在沙箱里加载失败时，整个成员测量无效、列出那个文件，不出分数、不报存活；工作树里照常能跑", () => {
  const dir = makeVitestRepo(MODULES);
  try {
    writeFiles(dir, { "test/guard.test.ts": GUARD_TEST });
    git(dir, "add -A"); git(dir, "commit -q -m guard");
    writeFiles(dir, { "src/calc.ts": VITEST_SRC.replace("  if (n < lo) return lo;", "  if (n < lo) { return lo; }").replace("return a + b;", "return b + a;") });
    const local = spawnSync("node", [join(MODULES, "vitest/vitest.mjs"), "run"], { cwd: dir, encoding: "utf8" });
    assert.equal(local.status, 0, "前提：工作树里全部用例能跑通\n" + local.stdout + local.stderr);
    const r = strykerRun(dir, ["--json", join(dir, "out.json")]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const json = JSON.parse(readFileSync(join(dir, "out.json"), "utf8"));
    assert.deepEqual([json.summary.valid, json.summary.invalidReason, json.summary.score, json.survivors, json.sites], [false, "沙箱预检没通过", null, [], []]);
    assert.deepEqual([json.baseline.passed, json.baseline.preflightFailed, json.baseline.failedFiles], [false, true, ["test/guard.test.ts"]]);
    assert.match(r.stdout, /^差分变异：基线 [0-9a-f]{12} 到工作树；位点 0：测量无效（沙箱预检没通过）\n基线不通过：\n[\s\S]*\n没跑通的测试文件：\n- test\/guard\.test\.ts\n/);
    assert.equal(existsSync(join(dir, ".stryker-tmp")), false);
    assert.equal(git(dir, "status --porcelain"), "M src/calc.ts\n?? out.json");
  } finally { rmSync(workDir(dir), { recursive: true, force: true }); dispose(dir); }
});

test.skipIf(skipReal)("超时复核上限：--recheck-limit 0 时超时位点都记「超时未复核」，不起第二轮，成员测量无效", () => {
  const dir = makeVitestRepo(MODULES);
  try {
    writeFiles(dir, { "src/loop.ts": "export function count(n: number): number {\n  let total = 0;\n  for (let i = 0; i < n; i++) total += 1;\n  return total;\n}\n", "test/loop.test.ts": 'import { test, expect } from "vitest";\nimport { count } from "../src/loop";\n\ntest("count", () => {\n  expect(count(3)).toBe(3);\n  expect(count(0)).toBe(0);\n});\n' });
    git(dir, "add -A"); git(dir, "commit -q -m loop");
    writeFiles(dir, { "src/loop.ts": readFileSync(join(dir, "src/loop.ts"), "utf8").replace("total += 1", "total = total + 1") });
    const r = strykerRun(dir, ["--format", "json", "--timeout", "2s", "--recheck-limit", "0"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const json = JSON.parse(r.stdout);
    const skipped = json.sites.filter((s) => s.reason === "超时未复核");
    assert.ok(skipped.length >= 1 && skipped.every((s) => s.verdict === "notRun"), JSON.stringify(json.sites.map((s) => [s.verdict, s.reason])));
    assert.equal(json.sites.some((s) => s.reason === "timeout"), false);
    assert.deepEqual([json.summary.valid, json.summary.invalidReason, json.summary.score], [false, `超时未复核 ${skipped.length} 个`, null]);
    assert.deepEqual(json.recheck, { limit: 0, skipped: skipped.length, total: 0, killed: 0, survived: 0, timedOut: 0, notRun: 0, seconds: null });
    assert.equal(existsSync(join(workDir(dir), "stryker-recheck.json")), false, "没有起第二轮");
  } finally { rmSync(workDir(dir), { recursive: true, force: true }); dispose(dir); }
});
