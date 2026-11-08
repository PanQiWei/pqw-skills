import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, writeFiles, dispose, tsPath } from "./fixture.mjs";
import { restoreLogPath } from "../skills/slice-closeout/scripts/lib/mutation.mjs";

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

test("纯删除也出位点：删掉 clamp 里一行 if 后 --plan-only 列出它剩下的位点", { skip }, () => {
  const dir = makeRepo({ "src/calc.ts": SRC });
  try {
    writeFiles(dir, { "src/calc.ts": SRC.replace("  if (x < lo) return lo;\n", "") });
    const r = run(dir, ["--test", "true", "--plan-only", "--format", "json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.ok(out.sites.some((s) => s.unit === "clamp" && s.original === ">"), JSON.stringify(out.sites));
    assert.equal(out.baseGiven, out.base);
  } finally { dispose(dir); }
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

test("「没跑测试」自动复跑一次后记 notRun(noTests)（第四程 C12 起基线须正常，所以用标记文件让基线之后的运行才打印）", { skip }, () => {
  const dir = setup();
  try {
    const r = run(dir, ["--test", "if [ -f flag ]; then echo 'No test files found'; fi; touch flag", "--format", "json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.ok(out.sites.length > 0);
    assert.ok(out.sites.every((s) => s.verdict === "notRun" && s.reason === "noTests"), JSON.stringify(out.sites[0]));
    assert.ok(out.sites.every((s) => s.runs === 2));
  } finally { dispose(dir); }
});

test("判定可信：「Tests 10 passed」不算没跑测试；基线也命中模式时抬头写明且位点存活", { skip }, () => {
  const dir = setup();
  try {
    const a = run(dir, ["--test", "echo 'Tests 10 passed'", "--format", "json"]);
    assert.equal(a.status, 0, a.stderr);
    const outA = JSON.parse(a.stdout);
    assert.ok(outA.sites.length > 0);
    assert.ok(outA.sites.every((s) => s.verdict === "survived" && s.runs === 1), JSON.stringify(outA.sites[0]));
    assert.equal(outA.baseline.patternHit, false);
    const b = run(dir, ["--test", "echo 'no tests ran'", "--format", "json"]);
    const outB = JSON.parse(b.stdout);
    assert.equal(outB.baseline.patternHit, true);
    assert.ok(outB.sites.every((s) => s.verdict === "survived"), JSON.stringify(outB.sites[0]));
    const table = run(dir, ["--test", "echo 'no tests ran'"]);
    assert.match(table.stdout, /\n「没跑测试」模式在基线输出上也命中，判不出没跑测试，位点按通过处理\n/);
  } finally { dispose(dir); }
});

test("判定可信：测试命令被信号结束记 notRun(crashed)；超时仍 killed(timeout) 并单列「其中超时」", { skip }, () => {
  const dir = setup();
  try {
    const crash = run(dir, ["--test", "if [ -f flag ]; then kill -SEGV $$; fi; touch flag", "--format", "json"]);
    assert.equal(crash.status, 0, crash.stderr);
    const outC = JSON.parse(crash.stdout);
    assert.equal(outC.baseline.passed, true);
    assert.ok(outC.sites.every((s) => s.verdict === "notRun" && s.reason === "crashed" && s.runs === 1), JSON.stringify(outC.sites[0]));
    assert.equal(outC.summary.timedOut, 0);
    writeFileSync(join(dir, "flag2"), "");
    const slow = run(dir, ["--test", "if [ -f slow ]; then sleep 5; fi; touch slow", "--timeout", "500ms"]);
    assert.match(slow.stdout, /位点 \d+：杀死 (\d+)（其中超时 \1）、存活 0/);
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
    assert.deepEqual([out.summary.valid, out.summary.invalidReason, out.summary.score], [false, "基线不通过", null]);
    const table = run(dir, ["--test", "node -e \"process.exit(3)\""]);
    assert.match(table.stdout, /^差分变异：基线 \w+ 到工作树；位点 \d+：测量无效（基线不通过）\n基线不通过：/);
    assert.doesNotMatch(table.stdout, /杀死 0/);
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

test("SIGHUP 时先还原再退出 129", { skip }, async () => {
  const dir = setup();
  try {
    const before = readFileSync(join(dir, "src/calc.ts"));
    const child = spawn("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--test", "node -e \"setTimeout(()=>{}, 4000)\"", "--timeout", "20s"], { stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((res) => setTimeout(res, 1500));
    child.kill("SIGHUP");
    const code = await new Promise((res) => child.on("close", res));
    assert.equal(code, 129);
    assert.deepEqual(readFileSync(join(dir, "src/calc.ts")), before);
  } finally { dispose(dir); }
});

test("还原日志：上次运行留下日志，启动先还原并打印；测试期间目标文件被改动则退出 1、打印「被改动」且不覆盖", { skip }, () => {
  const dir = setup();
  try {
    const root = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8" }).stdout.trim();
    const original = readFileSync(join(dir, "src/calc.ts"), "utf8");
    writeFileSync(join(dir, "src/calc.ts"), original + "// mutant left behind\n");
    mkdirSync(join(restoreLogPath(root), ".."), { recursive: true });
    writeFileSync(restoreLogPath(root), JSON.stringify({ root, path: "src/calc.ts", original }));
    const r = run(dir, ["--test", TESTCMD, "--plan-only"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /^上次运行留下的变异体已还原：src\/calc\.ts$/m);
    assert.equal(readFileSync(join(dir, "src/calc.ts"), "utf8"), original);
    assert.equal(existsSync(restoreLogPath(root)), false);

    // 基线那次不改，第一个位点的测试里改：还原前发现文件不是变异体。
    const editOnSecondRun = "node -e \"const fs=require('fs'); if (fs.existsSync('ran')) fs.appendFileSync('src/calc.ts', '// edited during run\\n'); else fs.writeFileSync('ran', '')\"";
    const t = run(dir, ["--test", editOnSecondRun]);
    assert.equal(t.status, 1);
    assert.match(t.stderr, /^文件在变异期间被改动：src\/calc\.ts$/m);
    const left = readFileSync(join(dir, "src/calc.ts"), "utf8");
    assert.match(left, /\/\/ edited during run\n$/, "不覆盖人改过的文件");
    assert.notEqual(left.replace("// edited during run\n", ""), original, "变异体也留在文件里，由日志下次还原");
    assert.equal(existsSync(restoreLogPath(root)), true, "没还原成功的日志保留");
    const again = run(dir, ["--test", TESTCMD, "--plan-only"]);
    assert.match(again.stderr, /已还原：src\/calc\.ts/);
    assert.equal(readFileSync(join(dir, "src/calc.ts"), "utf8"), original, "下次启动用日志还原");
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

test("历史指纹：文件顶部加一行照样沿用并写「沿用 N」；改了测试文件或换了测试命令整份不沿用并写明", { skip }, () => {
  const dir = setup();
  try {
    const first = JSON.parse(run(dir, ["--test", TESTCMD, "--json", join(dir, "h.json"), "--format", "json"]).stdout);
    assert.deepEqual(Object.keys(first.fingerprint), ["toolVersion", "testCommand", "testFilesDigest"]);
    writeFileSync(join(dir, "src/calc.ts"), "// 顶部加一行\n" + readFileSync(join(dir, "src/calc.ts"), "utf8"));
    const shifted = JSON.parse(run(dir, ["--test", TESTCMD, "--history", join(dir, "h.json"), "--format", "json"]).stdout);
    assert.deepEqual([shifted.history.used, shifted.summary.carried], [true, first.summary.killed], "行号变了仍沿用全部杀死");
    const table = run(dir, ["--test", TESTCMD, "--history", join(dir, "h.json")]);
    assert.match(table.stdout, new RegExp(`；沿用 ${first.summary.killed}`));
    writeFileSync(join(dir, "test/calc.test.mjs"), readFileSync(join(dir, "test/calc.test.mjs"), "utf8") + "// 改了测试\n");
    const changedTests = run(dir, ["--test", TESTCMD, "--history", join(dir, "h.json"), "--format", "json"]);
    const outT = JSON.parse(changedTests.stdout);
    assert.deepEqual([outT.history.used, outT.history.reason, outT.summary.carried], [false, "历史指纹不同（测试文件）", 0]);
    assert.match(run(dir, ["--test", TESTCMD, "--history", join(dir, "h.json")]).stdout, /\n历史未沿用：历史指纹不同（测试文件）\n/);
    const outC = JSON.parse(run(dir, ["--test", TESTCMD + " ", "--history", join(dir, "h.json"), "--format", "json"]).stdout);
    assert.equal(outC.history.reason, "历史指纹不同（测试命令）");
  } finally { dispose(dir); }
});
