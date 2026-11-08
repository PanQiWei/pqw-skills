// 资源模型：份额与并行度的算式、交给测试命令的环境、低优先级、JSON 的 resources 节、--help 教程。
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { makeVitestRepo, dispose, tsPath, strykerModules } from "./fixture.mjs";
import { cpus, freemem, loadavg } from "node:os";
import { capacity, plannedWorkers, formatResources } from "../skills/slice-closeout/scripts/lib/mutation.mjs";

const SCRIPT = new URL("../skills/slice-closeout/scripts/mutation.mjs", import.meta.url).pathname;
const TS = tsPath();
const MODULES = strykerModules();
const skip = TS && MODULES ? false : "没有 typescript 或 Stryker 模块";
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

test("资源摘要一行：核数、负载、同机任务、份额、并行度、nice；降档与减半的说明", () => {
  const r = { capacity: cap(), otherHeavyTasks: 1, share: 0.5, ceiling: 4, workers: 4, requested: 99, capped: true, halved: false, nice: 10, lowMemoryHalveMb: 2048 };
  assert.equal(formatResources(r), "资源：8 核，负载 0.5，同机另有 1 个重型任务，份额 50%，并行度 4，nice 10；显式 --workers 99 超过份额上限，按份额降到 4");
  assert.equal(formatResources({ ...r, requested: null, capped: false, halved: true, nice: null, capacity: cap({ freeMemMb: 900 }), workers: 2 }), "资源：8 核，负载 0.5，同机另有 1 个重型任务，份额 50%，并行度 2；可用内存 900 MB 低于 2048 MB，上限减半；本平台不降优先级");
  assert.equal(formatResources({ ...r, requested: null, capped: false, timing: { totalSeconds: 70.3 } }), "资源：8 核，负载 0.5，同机另有 1 个重型任务，份额 50%，并行度 4，nice 10；Stryker 一轮 70.3s，并行度启动时定下，运行中不调");
  assert.match(formatResources({ ...r, requested: null, capped: false, timing: { totalSeconds: 70.3, recheckSeconds: 12.5 } }), /Stryker 一轮 70\.3s，复核 12\.5s，并行度/);
});

test("--help 是教程：三个资源参数各一行，写了缺省与算式", () => {
  const r = spawnSync("node", [SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  for (const name of ["--other-heavy-tasks", "--workers", "--low-memory-halve", "--no-nice"]) assert.match(r.stdout, new RegExp(`^  ${name} .*缺省`, "m"), name);
  assert.match(r.stdout, /份额 = 1 \/ \(--other-heavy-tasks \+ 1\)/);
  assert.match(r.stdout, /concurrency/);
});

test.skipIf(skip)("命令面：--other-heavy-tasks 1 时份额 0.5，--workers 99 被降到上限，nice 10 写进资源；--no-nice 不降；数值错退出 2", () => {
  const dir = makeVitestRepo();
  try {
    const run = (extra) => spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--stryker-modules", MODULES, "--plan-only", "--format", "json", ...extra], { encoding: "utf8" });
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
    assert.equal("loadCeiling" in out.resources, false, "运行中自适应随内建引擎删除");
    assert.equal(out.resources.capacity.cpus, cpus().length);
    const table = spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--stryker-modules", MODULES, "--plan-only", "--other-heavy-tasks", "1", "--workers", "99"], { encoding: "utf8" });
    assert.match(table.stdout, /^差分变异：[^\n]*（只列）\n引擎：Stryker/, "只列时不出资源行以外的表格");
    const b = run(["--no-nice"]);
    assert.equal(JSON.parse(b.stdout).resources.nice, null);
    assert.equal(run(["--other-heavy-tasks", "x"]).status, 2);
    assert.equal(run(["--workers", "-1"]).status, 2);
  } finally { dispose(dir); }
});

const site = (over) => ({ id: "a.ts:1:0:logical", file: "a.ts", unit: "f", digest: "d1", line: 1, anchorLine: 1, start: 2, end: 4, original: "&&", mutant: "||", category: "logical", verdict: "planned", reason: null, runs: 0, seconds: null, ...over });
const fakePatcher = () => ({ apply() {}, restore: () => true });

