import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, writeFiles, dispose, tsPath } from "./fixture.mjs";

const SCRIPT = new URL("../skills/slice-closeout/scripts/mutation.mjs", import.meta.url).pathname;
const TS = tsPath();
const skip = TS ? false : "没有 typescript，设 PQW_TS";
const run = (dir, args) => spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", ...args], { encoding: "utf8" });

const SRC = `export function clamp(x: number, lo: number, hi: number) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
export function isPos(x: number) {
  return x > 0;
}
export function unused(a: number) {
  return a + 1;
}
`;
const TEST = `import { test } from "node:test";
import assert from "node:assert/strict";
import { clamp, isPos } from "../src/calc.ts";
test("clamp", () => { assert.equal(clamp(5, 0, 10), 5); assert.equal(clamp(-1, 0, 10), 0); assert.equal(clamp(11, 0, 10), 10); });
test("isPos", () => { assert.equal(isPos(1), true); assert.equal(isPos(0), false); });
`;
const LCOV = `SF:src/calc.ts\nDA:1,1\nDA:2,1\nDA:3,1\nDA:4,1\nDA:6,1\nDA:7,1\nDA:9,0\nDA:10,0\nend_of_record\n`;
const setup = () => { const dir = makeRepo({ "README.md": "x\n" }); writeFiles(dir, { "src/calc.ts": SRC, "test/calc.test.mjs": TEST, "lcov.info": LCOV }); return dir; };
const TESTCMD = "node --test test/";

test("--help 退出 0；缺 --test 退出 2", () => {
  assert.equal(spawnSync("node", [SCRIPT, "--help"], { encoding: "utf8" }).status, 0);
  const r = spawnSync("node", [SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 2);
});

test("--plan-only 只列位点，不改文件，不跑测试", { skip }, () => {
  const dir = setup();
  try {
    const before = readFileSync(join(dir, "src/calc.ts"));
    const r = run(dir, ["--test", `node -e "require('fs').writeFileSync('${join(dir, "ran")}', '1')"`, "--plan-only", "--format", "json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.ok(out.sites.length >= 4, `位点数 ${out.sites.length}`);
    assert.ok(out.sites.every((s) => s.file === "src/calc.ts"), "测试文件不进位点");
    assert.ok(out.sites.every((s) => s.verdict === "planned"));
    assert.ok(!existsSync(join(dir, "ran")), "plan-only 不该跑测试");
    assert.deepEqual(readFileSync(join(dir, "src/calc.ts")), before);
  } finally { dispose(dir); }
});

test("四类裁定各至少一例；存活带位置与替换；跑后逐字节还原", { skip }, () => {
  const dir = setup();
  try {
    const before = readFileSync(join(dir, "src/calc.ts"));
    const r = run(dir, ["--test", TESTCMD, "--lcov", "lcov.info", "--format", "json", "--budget", "5m"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const out = JSON.parse(r.stdout);
    const by = (v) => out.sites.filter((s) => s.verdict === v);
    assert.ok(by("killed").length >= 1, "killed");
    assert.ok(by("survived").length >= 1, "survived");
    assert.ok(by("uncovered").length >= 1, "uncovered");
    assert.ok(by("uncovered").every((s) => s.line >= 9), "unused 的位点无覆盖");
    const s = by("survived")[0];
    assert.ok(s.line >= 1 && typeof s.original === "string" && typeof s.mutant === "string");
    assert.deepEqual(readFileSync(join(dir, "src/calc.ts")), before);
    assert.equal(out.summary.score, out.summary.killed / (out.summary.killed + out.summary.survived));
    const table = run(dir, ["--test", TESTCMD, "--lcov", "lcov.info"]);
    assert.match(table.stdout, /存活/);
  } finally { dispose(dir); }
});

test("「没跑测试」自动复跑一次后记 notRun(noTests)", { skip }, () => {
  const dir = setup();
  try {
    const r = run(dir, ["--test", `node -e "console.log('No test files found')"`, "--format", "json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.ok(out.sites.length > 0);
    assert.ok(out.sites.every((s) => s.verdict === "notRun" && s.reason === "noTests"), JSON.stringify(out.sites[0]));
    assert.ok(out.sites.every((s) => s.runs === 2));
  } finally { dispose(dir); }
});

test("预算用尽：剩余位点 notRun(budget)，退出 0，标 budgetExceeded", { skip }, () => {
  const dir = setup();
  try {
    const r = run(dir, ["--test", TESTCMD, "--budget", "0s", "--format", "json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.budget.exceeded, true);
    assert.ok(out.sites.every((s) => s.verdict === "notRun" && s.reason === "budget"));
  } finally { dispose(dir); }
});

test("基线不通过：整程 notRun(baselineFailed)，退出 1", { skip }, () => {
  const dir = setup();
  try {
    const r = run(dir, ["--test", "node -e \"process.exit(3)\"", "--format", "json"]);
    assert.equal(r.status, 1);
    const out = JSON.parse(r.stdout);
    assert.equal(out.baseline.passed, false);
    assert.ok(out.sites.every((s) => s.verdict === "notRun" && s.reason === "baselineFailed"));
  } finally { dispose(dir); }
});

test("SIGINT 时先还原再退出 130", { skip }, async () => {
  const dir = setup();
  try {
    const before = readFileSync(join(dir, "src/calc.ts"));
    const child = spawn("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--test", "node -e \"setTimeout(()=>{}, 4000)\"", "--timeout", "20s"], { stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((res) => setTimeout(res, 1500));
    child.kill("SIGINT");
    const code = await new Promise((res) => child.on("close", res));
    assert.equal(code, 130);
    assert.deepEqual(readFileSync(join(dir, "src/calc.ts")), before);
  } finally { dispose(dir); }
});

test("历史：单元摘要未变且上次 killed 的位点沿用，不再跑", { skip }, () => {
  const dir = setup();
  try {
    const first = run(dir, ["--test", TESTCMD, "--json", join(dir, "h.json"), "--format", "json"]);
    assert.equal(first.status, 0, first.stderr);
    const r = run(dir, ["--test", TESTCMD, "--history", join(dir, "h.json"), "--format", "json"]);
    const out = JSON.parse(r.stdout);
    const killed = out.sites.filter((s) => s.verdict === "killed");
    assert.ok(killed.length > 0 && killed.every((s) => s.reason === "carried"));
  } finally { dispose(dir); }
});
