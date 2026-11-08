// 直接打 lib/mutation.mjs 的函数：时长、可打的文件、改动行、覆盖门控与历史沿用、写入器、运行器、裁定与预算、汇总与表格。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, cpus } from "node:os";
import { spawnSync } from "node:child_process";
import { makeRepo, writeFiles, dispose, tsPath } from "./fixture.mjs";
import { parseLcov, score } from "../skills/slice-closeout/scripts/lib/core.mjs";
import { parseDuration, isMutable, changedOwnLines, collectSites, isCovered, selectSites, createPatcher, createTestRunner, judgeSite, runSites, summarize, formatMutation, verdictOf } from "../skills/slice-closeout/scripts/lib/mutation.mjs";

const site = (over) => ({ id: "a.ts:1:0:logical", file: "a.ts", unit: "f", digest: "d1", line: 1, anchorLine: 1, start: 2, end: 4, original: "&&", mutant: "||", category: "logical", verdict: "planned", reason: null, runs: 0, seconds: null, ...over });

test("时长：无单位按秒，ms s m h，没给用缺省，格式错为 null", () => {
  assert.equal(parseDuration("90", 1), 90000);
  assert.equal(parseDuration("250ms", 1), 250);
  assert.equal(parseDuration("2s", 1), 2000);
  assert.equal(parseDuration("1.5m", 1), 90000);
  assert.equal(parseDuration("1h", 1), 3600000);
  assert.equal(parseDuration(undefined, 7), 7);
  assert.equal(parseDuration("3x", 1), null);
  assert.equal(parseDuration("m", 1), null);
});

test("可打的文件：源码且在范围内且在工作树里；测试、声明、node_modules、范围外、已删除都不打", () => {
  const dir = mkdtempSync(join(tmpdir(), "pqw-mut-"));
  try {
    for (const f of ["src/a.ts", "src/a.d.ts", "src/a.test.ts", "tests/b.ts", "node_modules/x/c.ts", "src/d.js", "src/e.md"]) { mkdirSync(join(dir, f, ".."), { recursive: true }); writeFileSync(join(dir, f), "x"); }
    assert.equal(isMutable(dir, "src/a.ts", null), true);
    assert.equal(isMutable(dir, "src/d.js", ["src/"]), true);
    assert.equal(isMutable(dir, "src/a.ts", ["lib/"]), false);
    assert.equal(isMutable(dir, "src/a.d.ts", null), false);
    assert.equal(isMutable(dir, "src/a.test.ts", null), false);
    assert.equal(isMutable(dir, "tests/b.ts", null), false);
    assert.equal(isMutable(dir, "node_modules/x/c.ts", null), false);
    assert.equal(isMutable(dir, "src/e.md", null), false);
    assert.equal(isMutable(dir, "src/gone.ts", null), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("改动行落在单元自己的行上才返回行集合；内层单元的行与第 0 行（不是真实行号）不算", () => {
  const outer = { name: "f", startLine: 1, endLine: 5 };
  const inner = { name: "f.g", startLine: 3, endLine: 3 };
  assert.deepEqual([...changedOwnLines(outer, [outer, inner], [[2, 2]])], [1, 2, 4, 5]);
  assert.equal(changedOwnLines(outer, [outer, inner], [[3, 3]]), null);
  assert.equal(changedOwnLines(outer, [outer, inner], [[0, 0]]), null);
  assert.equal(changedOwnLines(outer, [outer, inner], [[6, 9]]), null);
  assert.deepEqual([...changedOwnLines(inner, [outer, inner], [[3, 3]])], [3]);
});

const REPORT = parseLcov("SF:src/a.ts\nDA:3,1\nDA:4,0\nBRDA:6,0,0,2\nBRDA:6,0,1,0\nend_of_record\n");

test("覆盖门控：位点行或所在语句行有执行记录就算覆盖；分支记录也算；文件不在报告不算；没有报告一律算", () => {
  assert.equal(isCovered(REPORT, site({ file: "src/a.ts", line: 3, anchorLine: 3 })), true);
  assert.equal(isCovered(REPORT, site({ file: "src/a.ts", line: 4, anchorLine: 4 })), false);
  assert.equal(isCovered(REPORT, site({ file: "src/a.ts", line: 4, anchorLine: 3 })), true);
  assert.equal(isCovered(REPORT, site({ file: "src/a.ts", line: 6, anchorLine: 6 })), true);
  assert.equal(isCovered(REPORT, site({ file: "src/a.ts", line: 9, anchorLine: 9 })), false);
  assert.equal(isCovered(REPORT, site({ file: "src/other.ts", line: 3, anchorLine: 3 })), false);
  assert.equal(isCovered(null, site({ file: "src/other.ts", line: 9, anchorLine: 9 })), true);
});

test("选择：无覆盖标 uncovered；上次杀死且摘要未变才沿用；摘要变了、上次存活、没有历史都重跑", () => {
  const sites = [
    site({ id: "s1", file: "src/a.ts", line: 3, anchorLine: 3, digest: "d1" }),
    site({ id: "s2", file: "src/a.ts", line: 3, anchorLine: 3, digest: "d2" }),
    site({ id: "s3", file: "src/a.ts", line: 3, anchorLine: 3, digest: "d1" }),
    site({ id: "s4", file: "src/a.ts", line: 3, anchorLine: 3, digest: "d1" }),
    site({ id: "s5", file: "src/a.ts", line: 4, anchorLine: 4, digest: "d1" }),
  ];
  const history = { sites: [{ id: "s1", digest: "d1", verdict: "killed" }, { id: "s2", digest: "d1", verdict: "killed" }, { id: "s3", digest: "d1", verdict: "survived" }, { id: "s5", digest: "d1", verdict: "killed" }] };
  selectSites(sites, REPORT, history);
  assert.deepEqual(sites.map((s) => [s.verdict, s.reason]), [["killed", "carried"], ["planned", null], ["planned", null], ["planned", null], ["uncovered", null]]);
  const fresh = [site({ id: "s1", file: "src/a.ts", line: 3, anchorLine: 3 })];
  selectSites(fresh, null, null);
  assert.equal(fresh[0].verdict, "planned");
});

test("写入器：写入后能还原，还原逐字节核对，没有待还原的也返回 true", () => {
  const dir = mkdtempSync(join(tmpdir(), "pqw-patch-"));
  try {
    writeFileSync(join(dir, "a.ts"), "a && b\n");
    const p = createPatcher(dir);
    assert.equal(p.restore(), true);
    p.apply("a.ts", "a && b\n", "a || b\n");
    assert.equal(readFileSync(join(dir, "a.ts"), "utf8"), "a || b\n");
    assert.equal(p.restore(), true);
    assert.equal(readFileSync(join(dir, "a.ts"), "utf8"), "a && b\n");
    assert.equal(p.restore(), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("运行器：拿到退出码与输出；超时杀掉并标 timedOut；没在跑时 kill 不报错", async () => {
  const r = createTestRunner("echo hi; exit 3", process.cwd(), process.env);
  const a = await r.run(5000);
  assert.equal(a.code, 3);
  assert.equal(a.timedOut, false);
  assert.match(a.output, /hi/);
  assert.ok(a.seconds >= 0);
  const slow = createTestRunner("sleep 5", process.cwd(), process.env);
  const b = await slow.run(200);
  assert.equal(b.timedOut, true);
  assert.ok(b.seconds < 4);
  r.kill();
});

const fakeRunner = (results) => { const calls = []; return { calls, run: async (timeoutMs) => { calls.push(timeoutMs); return results.shift(); }, kill() {} }; };
const fakePatcher = (ok = true) => { const log = []; return { log, apply: (...a) => log.push(["apply", ...a]), restore: () => { log.push(["restore"]); return ok; } }; };
const pass = { code: 0, timedOut: false, output: "ok", seconds: 1 };
const fail = { code: 1, timedOut: false, output: "x", seconds: 2 };
const noTests = { code: 0, timedOut: false, output: "No test files found", seconds: 0.5 };
const NO_TESTS = /No test files found/i;

test("裁定：测试失败杀死；超时杀死并记 timeout；「没跑测试」复跑一次后按第二次定；两次都没跑记 notRun", async () => {
  const kill = site(); const patcher = fakePatcher();
  assert.equal(await judgeSite(kill, "a && b", { runner: fakeRunner([fail]), patcher, timeoutMs: 100, noTests: NO_TESTS }), true);
  assert.deepEqual([kill.verdict, kill.reason, kill.runs, kill.seconds], ["killed", null, 1, 2]);
  assert.deepEqual(patcher.log, [["apply", "a.ts", "a && b", "a || b"], ["restore"]]);
  const timeout = site();
  await judgeSite(timeout, "a && b", { runner: fakeRunner([{ code: null, timedOut: true, output: "", seconds: 3 }]), patcher: fakePatcher(), timeoutMs: 100, noTests: NO_TESTS });
  assert.deepEqual([timeout.verdict, timeout.reason], ["killed", "timeout"]);
  const survive = site();
  await judgeSite(survive, "a && b", { runner: fakeRunner([noTests, pass]), patcher: fakePatcher(), timeoutMs: 100, noTests: NO_TESTS });
  assert.deepEqual([survive.verdict, survive.reason, survive.runs, survive.seconds], ["survived", null, 2, 1.5]);
  const twice = site();
  await judgeSite(twice, "a && b", { runner: fakeRunner([noTests, noTests]), patcher: fakePatcher(), timeoutMs: 100, noTests: NO_TESTS });
  assert.deepEqual([twice.verdict, twice.reason, twice.runs], ["notRun", "noTests", 2]);
  const broken = site();
  assert.equal(await judgeSite(broken, "a && b", { runner: fakeRunner([pass]), patcher: fakePatcher(false), timeoutMs: 100, noTests: NO_TESTS }), false);
});

test("执行：基线不过则全部 notRun(baselineFailed) 且不写文件；预算用尽记 notRun(budget)；非 planned 的跳过；超时取基线用时 5 倍且至少 10 秒", async () => {
  const files = new Map([["a.ts", { text: "a && b" }]]);
  const sites1 = [site(), site({ verdict: "uncovered" })];
  const runner1 = fakeRunner([fail]); const patcher1 = fakePatcher();
  const r1 = await runSites({ sites: sites1, files, runner: runner1, patcher: patcher1, budgetMs: 60000, timeoutMs: null, noTests: NO_TESTS });
  assert.deepEqual([r1.baseline.passed, r1.baseline.seconds, r1.budget.exceeded, r1.restored], [false, 2, false, true]);
  assert.deepEqual(sites1.map((s) => [s.verdict, s.reason]), [["notRun", "baselineFailed"], ["uncovered", null]]);
  assert.deepEqual(runner1.calls, [600000]);
  assert.deepEqual(patcher1.log, []);

  const sites2 = [site(), site({ verdict: "killed", reason: "carried" }), site()];
  const runner2 = fakeRunner([pass, fail, pass]);
  const r2 = await runSites({ sites: sites2, files, runner: runner2, patcher: fakePatcher(), budgetMs: 60000, timeoutMs: null, noTests: NO_TESTS });
  assert.deepEqual([r2.baseline.passed, r2.budget.exceeded, r2.restored], [true, false, true]);
  assert.deepEqual(sites2.map((s) => s.verdict), ["killed", "killed", "survived"]);
  assert.deepEqual(runner2.calls, [600000, 10000, 10000]);

  const sites3 = [site(), site()];
  const runner3 = fakeRunner([{ ...pass, seconds: 3 }, fail]);
  const r3 = await runSites({ sites: sites3, files, runner: runner3, patcher: fakePatcher(), budgetMs: -1, timeoutMs: null, noTests: NO_TESTS });
  assert.equal(r3.budget.exceeded, true);
  assert.deepEqual(sites3.map((s) => [s.verdict, s.reason]), [["notRun", "budget"], ["notRun", "budget"]]);
  assert.deepEqual(runner3.calls, [600000]);

  const sites4 = [site()];
  const runner4 = fakeRunner([{ ...pass, seconds: 3 }, pass]);
  const r4 = await runSites({ sites: sites4, files, runner: runner4, patcher: fakePatcher(false), budgetMs: 60000, timeoutMs: null, noTests: NO_TESTS });
  assert.equal(r4.restored, false);
  assert.deepEqual(runner4.calls, [600000, 15000]);

  const runner5 = fakeRunner([pass, pass]);
  await runSites({ sites: [site()], files, runner: runner5, patcher: fakePatcher(), budgetMs: 60000, timeoutMs: 700, noTests: NO_TESTS });
  assert.deepEqual(runner5.calls, [700, 700]);
  const runner6 = fakeRunner([pass, pass]);
  await runSites({ sites: [site()], files, runner: runner6, patcher: fakePatcher(), budgetMs: 60000, timeoutMs: 0, noTests: NO_TESTS });
  assert.deepEqual(runner6.calls, [0, 0], "给了 0 就是 0，不回退到缺省");
});

const TS = tsPath();
const SCRIPT = new URL("../skills/slice-closeout/scripts/mutation.mjs", import.meta.url).pathname;

test("收集：位点按文件名再按位置排序，id 稳定", { skip: TS ? false : "没有 typescript，设 PQW_TS" }, async () => {
  const { loadTypescript } = await import("../skills/slice-closeout/scripts/lib/adapter-typescript.mjs");
  const dir = makeRepo({ "README.md": "x\n" });
  try {
    writeFiles(dir, { "src/b.ts": "export function f(a: number) { return a > 1 && a < 9; }\n", "src/a.ts": "export function g(a: number) { return a >= 1 || a <= 9; }\nexport function h(a: number) { return a !== 1; }\n", "src/c.ts": "export function o(a: number) {\n  function i(b: number) { return b > 1; }\n  return a < 2 && i(a);\n}\n" });
    const { sites } = collectSites({ root: dir, base: "HEAD", ts: loadTypescript(TS), scope: null });
    assert.deepEqual(sites.map((s) => s.id), ["src/a.ts:1:40:relational", "src/a.ts:1:45:logical", "src/a.ts:1:50:relational", "src/a.ts:2:98:equality", "src/b.ts:1:40:relational", "src/b.ts:1:44:logical", "src/b.ts:1:49:relational", "src/c.ts:2:66:relational", "src/c.ts:3:84:relational", "src/c.ts:3:88:logical"]);
    assert.deepEqual(sites.slice(7).map((s) => s.unit), ["o.i", "o", "o"], "内层单元的位点按位置排在外层之前");
  } finally { dispose(dir); }
});

test("工作线程数：缺省等于份额上限（没有同机任务时是 CPU 数；第四程 C8 把第三程的 CPU 数减一改成了这样），--workers 在上限内覆盖；都通过 PQW_TEST_WORKERS 交给测试命令", { skip: TS ? false : "没有 typescript，设 PQW_TS" }, () => {
  const dir = makeRepo({ "README.md": "x\n" });
  try {
    const run = (extra) => JSON.parse(spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--test", "echo workers=$PQW_TEST_WORKERS", "--format", "json", "--low-memory-halve", "0", ...extra], { encoding: "utf8" }).stdout);
    assert.match(run([]).baseline.tail, new RegExp(`workers=${Math.max(1, cpus().length)}\\b`));
    assert.match(run(["--workers", "3"]).baseline.tail, /workers=3\b/);
  } finally { dispose(dir); }
});

test("单次运行的裁定顺序：超时先于信号，信号或 128 以上退出码记 crashed，非零退出杀死，模式命中记 noTests，否则存活", () => {
  const re = /no tests/;
  assert.deepEqual(verdictOf({ code: null, signal: "SIGKILL", timedOut: true, output: "" }, re), ["killed", "timeout"]);
  assert.deepEqual(verdictOf({ code: null, signal: "SIGSEGV", timedOut: false, output: "" }, re), ["notRun", "crashed"]);
  assert.deepEqual(verdictOf({ code: 139, signal: null, timedOut: false, output: "" }, re), ["notRun", "crashed"]);
  assert.deepEqual(verdictOf({ code: 128, signal: null, timedOut: false, output: "" }, re), ["notRun", "crashed"], "128 起算信号");
  assert.deepEqual(verdictOf({ code: 127, signal: null, timedOut: false, output: "" }, re), ["killed", null]);
  assert.deepEqual(verdictOf({ code: 1, signal: null, timedOut: false, output: "no tests" }, re), ["killed", null]);
  assert.deepEqual(verdictOf({ code: 0, signal: null, timedOut: false, output: "no tests ran" }, re), ["notRun", "noTests"]);
  assert.deepEqual(verdictOf({ code: 0, signal: null, timedOut: false, output: "ok" }, re), ["survived", null]);
  const crashed = site();
  const runner = fakeRunner([{ code: null, signal: "SIGSEGV", timedOut: false, output: "", seconds: 1 }, pass]);
  return judgeSite(crashed, "a && b", { runner, patcher: fakePatcher(), timeoutMs: 100, noTests: NO_TESTS }).then(() => {
    assert.deepEqual([crashed.verdict, crashed.reason, crashed.runs], ["notRun", "crashed", 1], "crashed 不复跑");
  });
});

test("基线输出命中「没跑测试」模式：记 patternHit，裁定时不再用模式，位点存活", async () => {
  const files = new Map([["a.ts", { text: "a && b" }]]);
  const sites = [site(), site()];
  const runner = fakeRunner([noTests, noTests, noTests]);
  const r = await runSites({ sites, files, runner, patcher: fakePatcher(), budgetMs: 60000, timeoutMs: null, noTests: NO_TESTS });
  assert.equal(r.baseline.patternHit, true);
  assert.deepEqual(sites.map((s) => [s.verdict, s.runs]), [["survived", 1], ["survived", 1]]);
  const clean = await runSites({ sites: [site()], files, runner: fakeRunner([pass, noTests, noTests]), patcher: fakePatcher(), budgetMs: 60000, timeoutMs: null, noTests: NO_TESTS });
  assert.equal(clean.baseline.patternHit, false);
});

test("汇总：五类计数、超时单列、分数与存活清单的事实", () => {
  const sites = [site({ verdict: "killed" }), site({ verdict: "survived", original: "!", mutant: "" }), site({ verdict: "survived" }), site({ verdict: "uncovered" }), site({ verdict: "notRun" }), site()];
  const { summary, survivors } = summarize(sites);
  assert.deepEqual(summary, { total: 6, killed: 1, survived: 2, uncovered: 1, notRun: 1, planned: 1, timedOut: 0, score: score(sites) });
  assert.equal(summarize([site({ verdict: "killed", reason: "timeout" }), site({ verdict: "killed" })]).summary.timedOut, 1);
  assert.equal(survivors[0].suggestion, "删去 ! 后测试仍过", "只陈述事实");
  assert.equal(survivors[1].suggestion, "&& 换成 || 后测试仍过");
  assert.equal(survivors.length, 2);
  assert.match(survivors[0].suggestion, /^删去 ! 后测试仍过/);
  assert.match(survivors[1].suggestion, /^&& 换成 \|\| 后测试仍过/);
  assert.deepEqual(summarize([]).summary.total, 0);
});

test("表格：只列时不报计数；基线不过时贴尾巴；裁定带原因；没有位点时写一行说明；存活清单在末尾", () => {
  const base = "0123456789abcdef";
  const sites = [site({ verdict: "killed", reason: "carried" }), site({ verdict: "survived", line: 2, original: "!", mutant: "", category: "negation" })];
  const { summary, survivors } = summarize(sites);
  const ran = formatMutation({ base, planOnly: false, baseline: { passed: true, tail: "" }, budget: { exceeded: true }, sites, summary, survivors });
  assert.match(ran, /^差分变异：基线 0123456789ab 到工作树；位点 2：杀死 1、存活 1、无覆盖 0、未跑 0；分数 50%；预算用尽\n/);
  assert.match(ran, /\| a\.ts \| f \| 1 \| `&&` \| `\|\|` \| logical \| 杀死（carried） \|/);
  assert.match(ran, /\| a\.ts \| f \| 2 \| `!` \| `（删去）` \| negation \| 存活 \|/);
  assert.match(ran, /\n\n存活的位点：\n- a\.ts:2 f：删去 ! 后测试仍过/);
  const planned = formatMutation({ base, planOnly: true, baseline: { passed: null }, budget: { exceeded: false }, sites: [site()], summary: summarize([site()]).summary, survivors: [] });
  assert.match(planned, /位点 1（只列）\n\| 文件/);
  assert.match(planned, /\| 待跑 \|/);
  const failed = formatMutation({ base, planOnly: false, baseline: { passed: false, tail: "boom" }, budget: { exceeded: false }, sites: [], summary: summarize([]).summary, survivors: [] });
  assert.match(failed, /分数 无\n基线不通过：\nboom\n\| 文件/);
  assert.match(failed, /\| \| 没有位点 \|/);
  const timed = [site({ verdict: "killed", reason: "timeout" }), site({ verdict: "killed" })];
  const hit = formatMutation({ base, planOnly: false, baseline: { passed: true, tail: "", patternHit: true }, budget: { exceeded: false }, sites: timed, ...summarize(timed) });
  assert.match(hit, /^差分变异：基线 0123456789ab 到工作树；位点 2：杀死 2（其中超时 1）、存活 0、无覆盖 0、未跑 0；分数 100%\n「没跑测试」模式在基线输出上也命中，判不出没跑测试，位点按通过处理\n\| 文件/);
});
