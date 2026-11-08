// 资源模型：份额与并行度的算式、交给测试命令的环境、低优先级、JSON 的 resources 节、--help 教程。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpus, freemem, getPriority, loadavg } from "node:os";
import { makeRepo, dispose, tsPath } from "./fixture.mjs";
import { capacity, createTestRunner, plannedWorkers, runnerEnv, formatResources } from "../skills/slice-closeout/scripts/lib/mutation.mjs";

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
