// 资源模型：份额与并行度的算式、交给测试命令的环境、低优先级、JSON 的 resources 节、--help 教程。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpus, freemem, getPriority, loadavg } from "node:os";
import { makeRepo, writeFiles, dispose, tsPath } from "./fixture.mjs";
import { capacity, createTestRunner, plannedWorkers, runnerEnv, formatResources, createAdapter, runSites, collectSites, loadRatio, selfTiming } from "../skills/slice-closeout/scripts/lib/mutation.mjs";
import { loadTypescript } from "../skills/slice-closeout/scripts/lib/adapter-typescript.mjs";

const SCRIPT = new URL("../skills/slice-closeout/scripts/mutation.mjs", import.meta.url).pathname;
const TS = tsPath();
const skip = TS ? false : "没有 typescript，设 PQW_TS";
const cap = (over) => ({ cpus: 8, freeMemMb: 10000, load1: 0.5, ...over });

test("并行度：份额 1/(N+1)，上限 floor(cpus × 份额) 至少 1，显式 workers 不超上限，低内存减半", () => {
  assert.deepEqual(plannedWorkers(cap()), { share: 1, ceiling: 8, workers: 8, requested: null, capped: false, halved: false });
  assert.deepEqual(plannedWorkers(cap(), { otherHeavyTasks: 1 }), { share: 0.5, ceiling: 4, workers: 4, requested: null, capped: false, halved: false });
  assert.equal(plannedWorkers(cap(), { otherHeavyTasks: 3 }).workers, 2);
  assert.equal(plannedWorkers(cap(), { otherHeavyTasks: 15 }).workers, 1, "份额再小也至少 1");
  assert.equal(plannedWorkers(cap({ cpus: 1 }), { otherHeavyTasks: 1 }).workers, 1);
  assert.deepEqual(plannedWorkers(cap(), { otherHeavyTasks: 1, workers: 2 }), { share: 0.5, ceiling: 4, workers: 2, requested: 2, capped: false, halved: false });
  assert.deepEqual(plannedWorkers(cap(), { otherHeavyTasks: 1, workers: 99 }), { share: 0.5, ceiling: 4, workers: 4, requested: 99, capped: true, halved: false });
  assert.equal(plannedWorkers(cap(), { workers: 4 }).workers, 4);
  assert.equal(plannedWorkers(cap(), { workers: 8 }).capped, false, "等于上限不算降档");
  assert.equal(plannedWorkers(cap(), { workers: 0 }).workers, 1, "显式 0 也至少 1");
  assert.deepEqual(plannedWorkers(cap({ freeMemMb: 1000 }), { otherHeavyTasks: 1 }), { share: 0.5, ceiling: 2, workers: 2, requested: null, capped: false, halved: true });
  assert.equal(plannedWorkers(cap({ freeMemMb: 2048 }), { lowMemoryHalveMb: 2048 }).halved, false, "等于阈值不减半");
  assert.equal(plannedWorkers(cap({ freeMemMb: 100 }), { otherHeavyTasks: 7 }).workers, 1);
});

test("容量：核数至少 1，可用内存按 MB，负载取一分钟均值两位小数", () => {
  const c = capacity();
  assert.equal(c.cpus, Math.max(1, cpus().length));
  assert.ok(c.freeMemMb > 0 && Math.abs(c.freeMemMb - freemem() / 1048576) < 64, `freeMemMb ${c.freeMemMb}`);
  assert.ok(Math.abs(c.load1 - loadavg()[0]) < 0.02, `load1 ${c.load1}`);
  assert.equal(c.load1, Math.round(c.load1 * 100) / 100);
});

test("低优先级的运行器也能整组杀掉：nice 分支超时后不等子进程自然结束", async () => {
  const slow = createTestRunner("sleep 5", process.cwd(), process.env, { nice: 10 });
  const r = await slow.run(300);
  assert.equal(r.timedOut, true);
  assert.ok(r.seconds < 2, `用时 ${r.seconds}`);
});

test("交给测试命令的环境：两个变量等于并行度，剥掉 NODE_TEST_CONTEXT，不改原对象", () => {
  const base = { PATH: "/bin", NODE_TEST_CONTEXT: "child", VITEST_MAX_WORKERS: "99" };
  const env = runnerEnv(base, 3);
  assert.deepEqual(env, { PATH: "/bin", PQW_TEST_WORKERS: "3", VITEST_MAX_WORKERS: "3" });
  assert.equal(base.NODE_TEST_CONTEXT, "child");
});

test("资源摘要一行：核数、负载、同机任务、份额、并行度、nice；降档与减半的说明", () => {
  const r = { capacity: cap(), otherHeavyTasks: 1, share: 0.5, ceiling: 4, workers: 4, requested: 99, capped: true, halved: false, nice: 10, lowMemoryHalveMb: 2048 };
  assert.equal(formatResources(r), "资源：8 核，负载 0.5，同机另有 1 个重型任务，份额 50%，并行度 4，nice 10；显式 --workers 99 超过份额上限，按份额降到 4");
  assert.equal(formatResources({ ...r, requested: null, capped: false, halved: true, nice: null, capacity: cap({ freeMemMb: 900 }), workers: 2 }), "资源：8 核，负载 0.5，同机另有 1 个重型任务，份额 50%，并行度 2；可用内存 900 MB 低于 2048 MB，上限减半；本平台不降优先级");
});

test("--help 是教程：三个资源参数各一行，写了缺省与算式", () => {
  const r = spawnSync("node", [SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  for (const name of ["--other-heavy-tasks", "--workers", "--low-memory-halve", "--load-ceiling", "--no-nice"]) assert.match(r.stdout, new RegExp(`^  ${name} .*缺省`, "m"), name);
  assert.match(r.stdout, /份额 = 1 \/ \(--other-heavy-tasks \+ 1\)/);
  assert.match(r.stdout, /PQW_TEST_WORKERS/);
});

test("命令面：--other-heavy-tasks 1 时份额 0.5，--workers 99 被降到上限，测试命令拿到并行度并以 nice 10 运行；--no-nice 不降；数值错退出 2", { skip }, () => {
  const dir = makeRepo({ "README.md": "x\n" });
  try {
    const run = (extra) => spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--test", 'echo w=$PQW_TEST_WORKERS v=$VITEST_MAX_WORKERS n=$(ps -o ni= -p $$ | tr -d " ")', "--format", "json", ...extra], { encoding: "utf8" });
    const a = run(["--other-heavy-tasks", "1", "--workers", "99"]);
    assert.equal(a.status, 0, a.stderr);
    const out = JSON.parse(a.stdout);
    const expected = Math.max(1, Math.floor(cpus().length * 0.5));
    assert.equal(out.resources.share, 0.5);
    assert.equal(out.resources.otherHeavyTasks, 1);
    assert.equal(out.resources.requested, 99);
    assert.equal(out.resources.capped, true);
    assert.equal(out.resources.workers, out.resources.halved ? Math.max(1, Math.floor(expected / 2)) : expected);
    assert.equal(out.resources.nice, 10);
    assert.equal(out.resources.loadCeiling, 0.8);
    assert.equal(out.resources.capacity.cpus, cpus().length);
    const mine = getPriority();
    assert.match(out.baseline.tail, new RegExp(`w=${out.resources.workers} v=${out.resources.workers} n=${Math.min(19, mine + 10)}\\b`));
    const table = spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--test", "true", "--other-heavy-tasks", "1", "--workers", "99"], { encoding: "utf8" });
    assert.match(table.stdout, /\n资源：\d+ 核，负载 [\d.]+，同机另有 1 个重型任务，份额 50%，并行度 \d+，nice 10；显式 --workers 99 超过份额上限/);
    const b = run(["--no-nice", "--load-ceiling", "0.5"]);
    const outB = JSON.parse(b.stdout);
    assert.equal(outB.resources.nice, null);
    assert.equal(outB.resources.loadCeiling, 0.5);
    assert.match(outB.baseline.tail, new RegExp(`n=${mine}\\b`));
    const bad = run(["--other-heavy-tasks", "x"]);
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /数值格式错误：--other-heavy-tasks x/);
  } finally { dispose(dir); }
});

const site = (over) => ({ id: "a.ts:1:0:logical", file: "a.ts", unit: "f", digest: "d1", line: 1, anchorLine: 1, start: 2, end: 4, original: "&&", mutant: "||", category: "logical", verdict: "planned", reason: null, runs: 0, seconds: null, ...over });
const fakePatcher = () => ({ apply() {}, restore: () => true });

test("运行中自适应：负载比超过上限减半，回落到上限减 0.2 以下翻倍，并行度 1 且连续 3 次超限记繁忙；计时分出测试命令与自身开销", async () => {
  const loads = [0.9, 0.9, 0.5, 0.5, 0.95, 0.95, 0.95, 0.95];
  const adapter = createAdapter({ planned: 4, ceiling: 0.8, sampler: () => loads.shift() });
  const seen = [];
  const runner = { run: async (timeoutMs, workers = null) => { const code = seen.length ? 1 : 0; seen.push(workers); return { code, timedOut: false, output: "x", seconds: 0.1 }; }, kill() {} };
  const sites = Array.from({ length: 8 }, () => site());
  const r = await runSites({ sites, files: new Map([["a.ts", { text: "a && b" }]]), runner, patcher: fakePatcher(), budgetMs: 60000, timeoutMs: null, noTests: /never/, adapter });
  assert.deepEqual(seen, [null, 2, 1, 2, 4, 2, 1, 1, 1]);
  assert.deepEqual(r.adaptation, { workers: 1, samples: 8, downshifts: 4, upshifts: 2, minWorkers: 1, busy: true });
  assert.equal(r.timing.testSeconds, 0.9);
  assert.ok(r.timing.totalSeconds >= 0 && r.timing.overheadRatio >= 0 && r.timing.overheadRatio <= 1, JSON.stringify(r.timing));
  const calm = createAdapter({ planned: 4, ceiling: 0.8, sampler: () => 0.7 });
  assert.deepEqual([calm.next(), calm.next(), calm.next()], [4, 4, 4], "滞回区间内不动");
  const idle = createAdapter({ planned: 4, ceiling: 0.8, sampler: () => 0.5 });
  assert.deepEqual([idle.next(), idle.state.upshifts], [4, 0], "已在计划值不算升档");
  const edges = [0.8, 0.9, 0.7, 0.6, 0.59];
  const edge = createAdapter({ planned: 4, ceiling: 0.8, sampler: () => edges.shift() });
  assert.deepEqual([edge.next(), edge.next(), edge.next(), edge.next(), edge.next()], [4, 2, 2, 2, 4], "等于上限不降；等于上限减 0.2 不升");
  assert.ok(Math.abs(loadRatio() - loadavg()[0] / Math.max(1, cpus().length)) < 0.01);
  assert.deepEqual(selfTiming(0, 3, 10000), { totalSeconds: 10, testSeconds: 3, overheadRatio: 0.7 });
  assert.deepEqual(selfTiming(4000, 3, 10000), { totalSeconds: 6, testSeconds: 3, overheadRatio: 0.5 }, "起点不为 0 时按差算");
  assert.deepEqual(selfTiming(0, 12, 10000).overheadRatio, 0, "测试耗时超过总耗时时开销记 0");
  assert.deepEqual(selfTiming(0, 0, 0).overheadRatio, 0);
  const hot = createAdapter({ planned: 1, ceiling: 0.8, sampler: () => 0.9 });
  assert.deepEqual([hot.next(), hot.next(), hot.state.busy, hot.next(), hot.state.busy], [1, 1, false, 1, true]);
  const none = await runSites({ sites: [site()], files: new Map([["a.ts", { text: "a && b" }]]), runner, patcher: fakePatcher(), budgetMs: 60000, timeoutMs: null, noTests: /never/ });
  assert.equal(none.adaptation, null);
  const line = formatResources({ capacity: cap(), otherHeavyTasks: 0, share: 1, ceiling: 8, workers: 8, requested: null, capped: false, halved: false, nice: 10, lowMemoryHalveMb: 2048, loadCeiling: 0.8, adaptation: r.adaptation, timing: { totalSeconds: 10, testSeconds: 9, overheadRatio: 0.1 } });
  assert.equal(line, "资源：8 核，负载 0.5，同机另有 0 个重型任务，份额 100%，并行度 8，nice 10；运行中按负载降档 4 次、升档 2 次，最低并行度 1；机器繁忙：负载比持续高于上限 0.8，并行度已降到 1，耗时不代表工具本身；测试命令共 9s，总耗时 10s，工具自身开销 10%");
  const quiet = formatResources({ capacity: cap(), otherHeavyTasks: 0, share: 1, ceiling: 8, workers: 8, requested: null, capped: false, halved: false, nice: 10, lowMemoryHalveMb: 2048, loadCeiling: 0.8, adaptation: { workers: 8, samples: 3, downshifts: 0, upshifts: 0, minWorkers: 8, busy: false }, timing: { totalSeconds: 10, testSeconds: 9, overheadRatio: 0.1 } });
  assert.equal(quiet, "资源：8 核，负载 0.5，同机另有 0 个重型任务，份额 100%，并行度 8，nice 10；测试命令共 9s，总耗时 10s，工具自身开销 10%", "没降过档不写降档");
});

test("运行器按次换并行度：run 给了 workers 就临时覆盖环境变量，不给用创建时的", async () => {
  const runner = createTestRunner("echo w=$PQW_TEST_WORKERS", process.cwd(), runnerEnv(process.env, 8));
  assert.match((await runner.run(5000, 3)).output, /^w=3$/m);
  assert.match((await runner.run(5000)).output, /^w=8$/m);
});

test("自身开销：每个改动文件只解析一次，裁定位点不再解析", { skip }, async () => {
  const dir = makeRepo({ "src/a.ts": "export const f = (a: boolean, b: boolean) => a && b;\n", "src/b.ts": "export const g = (a: boolean, b: boolean) => a || b;\n" });
  try {
    writeFiles(dir, { "src/a.ts": "export const f = (a: boolean, b: boolean) => a && !b;\n", "src/b.ts": "export const g = (a: boolean, b: boolean) => !a || b;\n" });
    const real = loadTypescript(TS);
    let parses = 0;
    const ts = new Proxy(real, { get: (t, k) => (k === "createSourceFile" ? (...a) => { parses++; return t.createSourceFile(...a); } : t[k]) });
    const { files, sites } = collectSites({ root: dir, base: "HEAD", ts, scope: null });
    assert.equal(parses, 2);
    assert.equal(files.size, 2);
    assert.ok(sites.length >= 4, `位点 ${sites.length}`);
    let runs = 0;
    const runner = { run: async () => ({ code: runs++ ? 1 : 0, timedOut: false, output: "x", seconds: 0 }), kill() {} };
    await runSites({ sites, files, runner, patcher: fakePatcher(), budgetMs: 60000, timeoutMs: null, noTests: /never/ });
    assert.equal(parses, 2, "裁定期间没有再解析");
  } finally { dispose(dir); }
});
