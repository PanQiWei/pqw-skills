// 命令面上的引擎选择：抬头与 JSON 的 engine 字段、显式 stryker 不可用退出 2、非法 --engine 退出 2。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { makeRepo, writeFiles, dispose, tsPath } from "./fixture.mjs";

const SCRIPT = new URL("../skills/slice-closeout/scripts/mutation.mjs", import.meta.url).pathname;
const TS = tsPath();
const skip = TS ? false : "没有 typescript，设 PQW_TS";
const SRC = "export function isPos(x: number) {\n  return x > 0;\n}\n";
const cleanEnv = { ...process.env, PQW_STRYKER_MODULES: "/nonexistent/modules" };
const run = (dir, args, env = cleanEnv) => spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--test", "true", "--plan-only", ...args], { encoding: "utf8", env });

test("非法 --engine 退出 2，不需要别的输入", () => {
  const r = spawnSync("node", [SCRIPT, "--test", "true", "--engine", "jest"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^--engine 只接受 auto、stryker、builtin：jest/);
});

test("auto 在没有 vitest 的项目选内建：抬头第二行写原因，JSON 顶层有 engine", { skip }, () => {
  const dir = makeRepo({ "src/calc.ts": SRC });
  try {
    writeFiles(dir, { "src/calc.ts": SRC.replace("> 0", ">= 0") });
    const text = run(dir, []);
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /^差分变异：基线 [0-9a-f]{12} 到工作树；位点 \d+（只列）\n引擎：内建（项目没有 vitest 配置也没有声明 vitest，Stryker 引擎只支持 vitest）\n\| 文件/);
    const json = JSON.parse(run(dir, ["--format", "json"]).stdout);
    assert.deepEqual(json.engine, { name: "builtin", version: null, runner: null, reason: "项目没有 vitest 配置也没有声明 vitest，Stryker 引擎只支持 vitest" });
    assert.deepEqual(json.budget, { limitMs: 20 * 60000, exceeded: false });
    assert.match(run(dir, ["--engine", "builtin"]).stdout, /\n引擎：内建（显式 --engine builtin）\n/);
  } finally { dispose(dir); }
});

test("有 vitest 配置但找不到依赖：auto 选内建并写装法；显式 stryker 退出 2 写装法与三处目录", { skip }, () => {
  const dir = makeRepo({ "src/calc.ts": SRC, "vitest.config.ts": "export default {};\n" });
  try {
    const auto = run(dir, ["--format", "json"]);
    assert.equal(auto.status, 0, auto.stderr);
    assert.match(JSON.parse(auto.stdout).engine.reason, /^找不到 Stryker：.*npm ci --prefix /);
    const forced = run(dir, ["--engine", "stryker"]);
    assert.equal(forced.status, 2);
    assert.match(forced.stderr, new RegExp(`找不到 Stryker：${join(dir, "node_modules")}、/nonexistent/modules、.*skills/slice-closeout/scripts/node_modules 里都没有`));
    const fake = join(dir, "fake-modules");
    for (const name of ["@stryker-mutator/core", "@stryker-mutator/vitest-runner", "vitest"]) { mkdirSync(join(fake, name), { recursive: true }); writeFileSync(join(fake, name, "package.json"), JSON.stringify({ name, version: "10.1.1" })); }
    const found = run(dir, ["--stryker-modules", fake]);
    assert.equal(found.status, 0, found.stderr);
    assert.match(found.stdout, /\n引擎：Stryker 10\.1\.1（vitest）\n/);
  } finally { dispose(dir); }
});

import { existsSync, readFileSync, rmSync } from "node:fs";
import { makeVitestRepo, VITEST_SRC } from "./fixture.mjs";
import { workDir } from "../skills/slice-closeout/scripts/lib/stryker.mjs";

const MODULES = process.env.PQW_STRYKER_MODULES && existsSync(join(process.env.PQW_STRYKER_MODULES, "@stryker-mutator/core")) ? process.env.PQW_STRYKER_MODULES : null;
const skipReal = skip || (MODULES ? false : "没有 Stryker 模块，设 PQW_STRYKER_MODULES");
const fakeModules = (dir) => { const fake = join(dir, "fake-modules"); for (const name of ["@stryker-mutator/core", "@stryker-mutator/vitest-runner", "vitest"]) { mkdirSync(join(fake, name), { recursive: true }); writeFileSync(join(fake, name, "package.json"), JSON.stringify({ name, version: "10.1.1" })); } return fake; };
const strykerRun = (dir, args) => spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", ...args], { encoding: "utf8", env: cleanEnv });

test("Stryker 引擎只列：写引擎行与 mutate 条目，不起 Stryker，--test 可省略", { skip }, () => {
  const dir = makeVitestRepo();
  try {
    const fake = fakeModules(dir);
    writeFiles(dir, { "src/calc.ts": VITEST_SRC.replace("  if (n < lo) return lo;", "  if (n < lo) { return lo; }") });
    const r = strykerRun(dir, ["--plan-only", "--stryker-modules", fake, "--budget", "1m"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trimEnd(), `差分变异：基线 ${JSON.parse(strykerRun(dir, ["--plan-only", "--stryker-modules", fake, "--format", "json"]).stdout).base.slice(0, 12)} 到工作树；位点 由引擎生成（只列）\n引擎：Stryker 10.1.1（vitest）\n--budget 对 Stryker 引擎不适用：引擎没有整轮预算\nmutate 条目：\n- src/calc.ts:2-2`);
    assert.equal(existsSync(join(dir, ".stryker-tmp")), false);
    const json = JSON.parse(strykerRun(dir, ["--plan-only", "--stryker-modules", fake, "--format", "json", "--files", "src/calc.ts"]).stdout);
    assert.deepEqual(json.mutate, ["src/calc.ts"]);
    assert.equal(json.testCommand, null);
    assert.deepEqual(json.budget, { limitMs: null, exceeded: false });
    rmSync(join(dir, ".gitignore"));
    assert.match(strykerRun(dir, ["--plan-only", "--stryker-modules", fake]).stdout, /\n`\.stryker-tmp` 没被项目忽略/);
    writeFiles(dir, { "src/calc.ts": VITEST_SRC, ".gitignore": "node_modules\n.stryker-tmp\n" });
    const none = strykerRun(dir, ["--stryker-modules", fake, "--format", "json"]);
    assert.equal(none.status, 0, none.stderr);
    const noneJson = JSON.parse(none.stdout);
    assert.deepEqual([noneJson.mutate, noneJson.sites, noneJson.summary.valid, noneJson.summary.invalidReason, noneJson.baseline.passed], [[], [], false, "没有位点", null], "没有改动就不起 Stryker，测量无效（没有位点）");
  } finally { dispose(dir); }
});

test("Stryker 引擎真跑一轮：四类计数与表格同内建格式，存活清单，项目文件不变，.stryker-tmp 已删，报告在系统临时目录", { skip: skipReal }, () => {
  const dir = makeVitestRepo(MODULES);
  try {
    const mutated = VITEST_SRC.replace("  if (n < lo) return lo;", "  if (n < lo) { return lo; }");
    writeFiles(dir, { "src/calc.ts": mutated });
    const r = strykerRun(dir, ["--json", join(dir, "out.json")]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /^差分变异：基线 [0-9a-f]{12} 到工作树；位点 5：杀死 4、存活 1、无覆盖 0、未跑 0；分数 80%\n引擎：Stryker 10\.1\.1（vitest）\n增量：已开，本轮没有沿用\n\| 文件 \| 单元 \| 行 \| 原文 \| 替换 \| 类别 \| 裁定 \|\n/);
    assert.match(r.stdout, /\| src\/calc\.ts \| clamp \| 2 \| `n < lo` \| `n <= lo` \| equality \| 存活 \|/);
    assert.match(r.stdout, /\n存活的位点：\n- src\/calc\.ts:2 clamp：n < lo 换成 n <= lo 后测试仍过\n/);
    assert.match(r.stdout, /Stryker 一轮 [\d.]+s，并行度启动时定下/);
    const json = JSON.parse(readFileSync(join(dir, "out.json"), "utf8"));
    assert.equal(json.engine.name, "stryker");
    assert.equal(json.baseline.passed, true);
    assert.ok(json.baseline.seconds > 0 && json.baseline.seconds < 120, `一轮秒数：${json.baseline.seconds}`);
    assert.equal(json.resources.timing.totalSeconds, json.baseline.seconds);
    assert.equal(json.summary.valid, true);
    assert.equal(json.sites.length, 5);
    assert.ok(json.sites.every((s) => s.file === "src/calc.ts" && s.unit === "clamp" && s.line === 2));
    assert.equal(readFileSync(join(dir, "src/calc.ts"), "utf8"), mutated, "项目文件不变");
    assert.equal(existsSync(join(dir, ".stryker-tmp")), false);
    assert.ok(existsSync(join(workDir(dir), "mutation.json")));
    assert.ok(existsSync(join(workDir(dir), "stryker.log")));
    assert.deepEqual(json.incremental, { file: join(workDir(dir), "incremental.json"), force: true });
    assert.equal(json.fingerprint.testCommand, "vitest@4.1.11 + vitest.config.ts");
    assert.equal(json.fingerprint.strykerVersion, "10.1.1");
    assert.ok(existsSync(join(workDir(dir), "incremental.json")), "引擎写了增量文件");
    const again = strykerRun(dir, ["--json", join(dir, "out2.json"), "--history", join(dir, "out.json")]);
    assert.equal(again.status, 0, again.stderr + again.stdout);
    assert.match(again.stdout, /^差分变异：[^\n]*；分数 80%；沿用 5\n历史未沿用：--history 在 Stryker 引擎下不适用，增量由引擎负责\n引擎：Stryker/, "第二轮全部沿用，--history 写说明");
    const json2 = JSON.parse(readFileSync(join(dir, "out2.json"), "utf8"));
    assert.deepEqual([json2.incremental.force, json2.summary.carried, json2.history], [false, 5, { given: true, used: false, reason: "--history 在 Stryker 引擎下不适用，增量由引擎负责" }]);
    writeFiles(dir, { "test/calc.test.ts": readFileSync(join(dir, "test/calc.test.ts"), "utf8") + "\n// touched\n" });
    const forced = JSON.parse(strykerRun(dir, ["--format", "json"]).stdout);
    assert.equal(forced.incremental.force, true, "测试文件变了指纹就变，整轮重跑");
    assert.ok(forced.engine.notes.includes("增量：指纹变了，整轮重跑"), JSON.stringify(forced.engine.notes));
  } finally { rmSync(workDir(dir), { recursive: true, force: true }); dispose(dir); }
});

test("Stryker 初跑失败：退出 1，抬头写测量无效（Stryker 初跑失败），基线不通过带日志尾，.stryker-tmp 已删", { skip: skipReal }, () => {
  const dir = makeVitestRepo(MODULES);
  try {
    writeFiles(dir, { "src/calc.ts": VITEST_SRC.replace("  return n > 0;", "  return n < 0;") });
    const r = strykerRun(dir, []);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /^差分变异：基线 [0-9a-f]{12} 到工作树；位点 0：测量无效（Stryker 初跑失败）\n基线不通过：\n[\s\S]*initial test run[\s\S]*完整日志 .*stryker\.log）\n引擎：Stryker 10\.1\.1（vitest）\n/);
    assert.equal(existsSync(join(dir, ".stryker-tmp")), false);
  } finally { rmSync(workDir(dir), { recursive: true, force: true }); dispose(dir); }
});
