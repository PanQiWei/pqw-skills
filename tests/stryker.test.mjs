// 命令面：退役参数、不是 vitest 或缺依赖退出 2、只列、真跑、增量、初跑失败、信号清理。
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { makeRepo, writeFiles, dispose, tsPath, strykerModules, git } from "./fixture.mjs";

const SCRIPT = new URL("../skills/slice-closeout/scripts/mutation.mjs", import.meta.url).pathname;
const TS = tsPath();
const skip = TS ? false : "没有 typescript，设 PQW_TS";
const SRC = "export function isPos(x: number) {\n  return x > 0;\n}\n";
const cleanEnv = { ...process.env, PQW_STRYKER_MODULES: "/nonexistent/modules" };
const run = (dir, args, env = cleanEnv) => spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--plan-only", ...args], { encoding: "utf8", env });
const fakeModules = (dir) => { const fake = join(dir, "fake-modules"); for (const name of ["@stryker-mutator/core", "@stryker-mutator/vitest-runner", "vitest"]) { mkdirSync(join(fake, name), { recursive: true }); writeFileSync(join(fake, name, "package.json"), JSON.stringify({ name, version: "10.1.1" })); } return fake; };

test("0.8.0 退役的参数退出 2 并写原因，不需要别的输入", () => {
  for (const [flag, why] of [["--engine", "内建引擎已删"], ["--test", "不再需要"], ["--budget", "单独复核"], ["--lcov", "不读 lcov"], ["--history", "incremental"]]) {
    const r = spawnSync("node", [SCRIPT, flag, "x"], { encoding: "utf8" });
    assert.equal(r.status, 2, flag);
    assert.match(r.stderr, new RegExp(`^${flag} 0\\.8\\.0 起退役：.*${why}`), flag);
  }
  assert.equal(spawnSync("node", [SCRIPT, "--help"], { encoding: "utf8" }).status, 0);
});

test.skipIf(skip)("项目不是 vitest：退出 2 写只支持 vitest", () => {
  const dir = makeRepo({ "src/calc.ts": SRC });
  try {
    const r = run(dir, []);
    assert.equal(r.status, 2, r.stdout);
    assert.match(r.stderr, /^项目没有 vitest 配置也没有声明 vitest：本工具只支持 vitest 项目/);
  } finally { dispose(dir); }
});

test.skipIf(skip)("有 vitest 配置但找不到依赖：退出 2 写装法与三处目录；指定目录里有就用它", () => {
  const dir = makeRepo({ "src/calc.ts": SRC, "vitest.config.ts": "export default {};\n", ".gitignore": ".stryker-tmp\n" });
  try {
    const missing = run(dir, []);
    assert.equal(missing.status, 2, missing.stdout);
    assert.match(missing.stderr, new RegExp(`^找不到 Stryker：${join(dir, "node_modules")}、/nonexistent/modules、.*skills/slice-closeout/scripts/node_modules 里都没有.*npm ci --prefix`));
    const found = run(dir, ["--stryker-modules", fakeModules(dir)]);
    assert.equal(found.status, 0, found.stderr);
    assert.match(found.stdout, /\n引擎：Stryker 10\.1\.1（vitest）\n/);
    const json = JSON.parse(run(dir, ["--stryker-modules", fakeModules(dir), "--format", "json"]).stdout);
    assert.deepEqual(json.engine, { name: "stryker", version: "10.1.1", runner: "vitest", reason: "项目根有 vitest.config.ts；Stryker 10.1.1 取自指定目录", notes: [] });
    assert.equal(json.recheck, null);
    assert.equal("budget" in json, false);
  } finally { dispose(dir); }
});

import { existsSync, readFileSync, rmSync } from "node:fs";
import { makeVitestRepo, VITEST_SRC } from "./fixture.mjs";
import { workDir } from "../skills/slice-closeout/scripts/lib/stryker.mjs";

const MODULES = strykerModules();
const skipReal = skip || (MODULES ? false : "没有 Stryker 模块，设 PQW_STRYKER_MODULES");
const strykerRun = (dir, args) => spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", ...args], { encoding: "utf8", env: cleanEnv });

test.skipIf(skip)("Stryker 引擎只列：写引擎行与 mutate 条目，不起 Stryker", () => {
  const dir = makeVitestRepo();
  try {
    const fake = fakeModules(dir);
    writeFiles(dir, { "src/calc.ts": VITEST_SRC.replace("  if (n < lo) return lo;", "  if (n < lo) { return lo; }") });
    const r = strykerRun(dir, ["--plan-only", "--stryker-modules", fake]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trimEnd(), `差分变异：基线 ${JSON.parse(strykerRun(dir, ["--plan-only", "--stryker-modules", fake, "--format", "json"]).stdout).base.slice(0, 12)} 到工作树；位点 由引擎生成（只列）\n引擎：Stryker 10.1.1（vitest）\nmutate 条目：\n- src/calc.ts:1-5`, "改动行在 clamp 里，范围扩成 clamp 自己的行，与内建引擎一致");
    assert.equal(existsSync(join(dir, ".stryker-tmp")), false);
    const json = JSON.parse(strykerRun(dir, ["--plan-only", "--stryker-modules", fake, "--format", "json", "--files", "src/calc.ts"]).stdout);
    assert.deepEqual(json.mutate, ["src/calc.ts"]);
    assert.equal("testCommand" in json, false);
    assert.equal("budget" in json, false);
    rmSync(join(dir, ".gitignore"));
    assert.match(strykerRun(dir, ["--plan-only", "--stryker-modules", fake]).stdout, /\n`\.stryker-tmp` 没被项目忽略/);
    writeFiles(dir, { "src/calc.ts": VITEST_SRC, ".gitignore": "node_modules\n.stryker-tmp\n" });
    const none = strykerRun(dir, ["--stryker-modules", fake, "--format", "json"]);
    assert.equal(none.status, 0, none.stderr);
    const noneJson = JSON.parse(none.stdout);
    assert.deepEqual([noneJson.mutate, noneJson.sites, noneJson.summary.valid, noneJson.summary.invalidReason, noneJson.baseline.passed], [[], [], false, "没有位点", null], "没有改动就不起 Stryker，测量无效（没有位点）");
  } finally { dispose(dir); }
});

test.skipIf(skipReal)("Stryker 引擎真跑一轮：四类计数与表格，存活清单，项目文件不变，.stryker-tmp 已删，报告在系统临时目录", () => {
  const dir = makeVitestRepo(MODULES);
  try {
    const mutated = VITEST_SRC.replace("  if (n < lo) return lo;", "  if (n < lo) { return lo; }");
    writeFiles(dir, { "src/calc.ts": mutated });
    const r = strykerRun(dir, ["--json", join(dir, "out.json")]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /^差分变异：基线 [0-9a-f]{12} 到工作树；位点 (\d+)：杀死 \d+、存活 \d+、无覆盖 0、未跑 0；分数 \d+%\n引擎：Stryker 10\.1\.1（vitest）\n增量：已开，本轮没有沿用\n\| 文件 \| 单元 \| 行 \| 原文 \| 替换 \| 类别 \| 裁定 \|\n/);
    assert.match(r.stdout, /\| src\/calc\.ts \| clamp \| 2 \| `n < lo` \| `n <= lo` \| equality \| 存活 \|/);
    assert.match(r.stdout, /\n存活的位点：\n- src\/calc\.ts:2 clamp：n < lo 换成 n <= lo 后测试仍过\n/);
    assert.match(r.stdout, /Stryker 一轮 [\d.]+s，并行度启动时定下/);
    const json = JSON.parse(readFileSync(join(dir, "out.json"), "utf8"));
    assert.equal(json.engine.name, "stryker");
    assert.equal(json.baseline.passed, true);
    assert.ok(json.baseline.seconds > 0 && json.baseline.seconds < 60, `初跑秒数从日志取：${json.baseline.seconds}`);
    assert.ok(json.resources.timing.totalSeconds >= json.baseline.seconds, "整轮耗时不小于初跑");
    assert.equal(json.summary.valid, true);
    assert.ok(json.sites.length >= 9, `clamp 自己的行上的变异体：${json.sites.length}`);
    assert.ok(json.sites.every((s) => s.file === "src/calc.ts" && s.unit === "clamp" && s.line >= 1 && s.line <= 3), JSON.stringify(json.sites.map((s) => s.line)));
    assert.equal(json.summary.unknown, undefined);
    assert.deepEqual(json.unknown, []);
    assert.equal(readFileSync(join(dir, "src/calc.ts"), "utf8"), mutated, "项目文件不变");
    assert.equal(existsSync(join(dir, ".stryker-tmp")), false);
    assert.ok(existsSync(join(workDir(dir), "mutation.json")));
    assert.ok(existsSync(join(workDir(dir), "mutation.log")));
    assert.deepEqual(json.incremental, { file: join(workDir(dir), "incremental.json"), force: true });
    assert.equal(json.fingerprint.testCommand, "vitest@4.1.11 + vitest.config.ts");
    assert.equal(json.fingerprint.strykerVersion, "10.1.1");
    assert.ok(existsSync(join(workDir(dir), "incremental.json")), "引擎写了增量文件");
    const again = strykerRun(dir, ["--json", join(dir, "out2.json")]);
    assert.equal(again.status, 0, again.stderr + again.stdout);
    assert.match(again.stdout, new RegExp(`^差分变异：[^\\n]*；沿用 ${json.sites.length}\\n引擎：Stryker`), "第二轮全部沿用");
    const json2 = JSON.parse(readFileSync(join(dir, "out2.json"), "utf8"));
    assert.deepEqual([json2.incremental.force, json2.summary.carried, "history" in json2], [false, json.sites.length, false]);
    writeFiles(dir, { "test/calc.test.ts": readFileSync(join(dir, "test/calc.test.ts"), "utf8") + "\n// touched\n" });
    const forced = JSON.parse(strykerRun(dir, ["--format", "json"]).stdout);
    assert.equal(forced.incremental.force, true, "测试文件变了指纹就变，整轮重跑");
    assert.ok(forced.engine.notes.includes("增量：指纹变了，整轮重跑"), JSON.stringify(forced.engine.notes));
  } finally { rmSync(workDir(dir), { recursive: true, force: true }); dispose(dir); }
});

test.skipIf(skipReal)("Stryker 真跑的超时复核：死循环变异体第一轮超时，第二轮一个进程、时限按 --recheck-timeout 放宽仍超时，抬头写复核 N（仍超时 N），项目文件不变", () => {
  const dir = makeVitestRepo(MODULES);
  try {
    writeFiles(dir, { "src/loop.ts": "export function count(n: number): number {\n  let total = 0;\n  for (let i = 0; i < n; i++) total += 1;\n  return total;\n}\n", "test/loop.test.ts": 'import { test, expect } from "vitest";\nimport { count } from "../src/loop";\n\ntest("count", () => {\n  expect(count(3)).toBe(3);\n  expect(count(0)).toBe(0);\n});\n' });
    git(dir, "add -A"); git(dir, 'commit -q -m loop');
    writeFiles(dir, { "src/loop.ts": readFileSync(join(dir, "src/loop.ts"), "utf8").replace("total += 1", "total = total + 1") });
    const r = strykerRun(dir, ["--json", join(dir, "out.json"), "--timeout", "2s", "--recheck-timeout", "8s"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const json = JSON.parse(readFileSync(join(dir, "out.json"), "utf8"));
    assert.ok(json.recheck && json.recheck.total >= 1, `有超时才有复核：${JSON.stringify(json.recheck)}`);
    assert.deepEqual([json.recheck.killed, json.recheck.survived, json.recheck.notRun, json.recheck.timedOut, json.summary.timedOut], [0, 0, 0, json.recheck.total, json.recheck.total], "死循环放宽时限仍超时");
    assert.match(r.stdout, new RegExp(`（其中超时 ${json.recheck.total}）[^\\n]*；复核 ${json.recheck.total}（超时转杀死 0、存活 0、仍超时 ${json.recheck.total}）\\n`));
    assert.match(r.stdout, /Stryker 一轮 [\d.]+s，复核 [\d.]+s，并行度启动时定下/);
    const second = JSON.parse(readFileSync(join(workDir(dir), "stryker-recheck.json"), "utf8"));
    assert.deepEqual([second.concurrency, second.timeoutMS, second.incremental], [1, 8000, false]);
    assert.equal(JSON.parse(readFileSync(join(workDir(dir), "stryker-mutation.json"), "utf8")).timeoutMS, 2000, "第二轮时限比第一轮宽");
    assert.equal(git(dir, "status --porcelain"), "M src/loop.ts\n?? out.json", "项目文件不变（out.json 是本用例自己写的）");
    assert.ok(second.mutate.every((e) => /^src\/loop\.ts:\d+-\d+$/.test(e)), JSON.stringify(second.mutate));
    assert.equal(existsSync(join(dir, ".stryker-tmp")), false);
  } finally { rmSync(workDir(dir), { recursive: true, force: true }); dispose(dir); }
});

test.skipIf(skipReal)("Stryker 初跑失败：退出 1，抬头写测量无效（Stryker 初跑失败），基线不通过带日志尾，.stryker-tmp 已删", () => {
  const dir = makeVitestRepo(MODULES);
  try {
    writeFiles(dir, { "src/calc.ts": VITEST_SRC.replace("  return n > 0;", "  return n < 0;") });
    const r = strykerRun(dir, []);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /^差分变异：基线 [0-9a-f]{12} 到工作树；位点 0：测量无效（Stryker 初跑失败）\n基线不通过：\n[\s\S]*initial test run[\s\S]*完整日志 .*mutation\.log）\n引擎：Stryker 10\.1\.1（vitest）\n/);
    assert.equal(existsSync(join(dir, ".stryker-tmp")), false);
  } finally { rmSync(workDir(dir), { recursive: true, force: true }); dispose(dir); }
});

test.skipIf(skipReal)("Stryker 引擎被 SIGTERM 结束：退出 143，自己留下的 .stryker-tmp 已删，项目文件不变", async () => {
  const dir = makeVitestRepo(MODULES);
  try {
    const mutated = VITEST_SRC.replace("  if (n < lo) return lo;", "  if (n < lo) { return lo; }");
    writeFiles(dir, { "src/calc.ts": mutated });
    const child = spawn("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD"], { env: cleanEnv, stdio: ["ignore", "pipe", "pipe"] });
    const started = Date.now();
    while (!existsSync(join(dir, ".stryker-tmp")) && Date.now() - started < 20000) await new Promise((r) => setTimeout(r, 100));
    assert.ok(existsSync(join(dir, ".stryker-tmp")), "Stryker 已开始建沙箱");
    child.kill("SIGTERM");
    const code = await new Promise((r) => child.on("close", (c) => r(c)));
    assert.equal(code, 143);
    assert.equal(existsSync(join(dir, ".stryker-tmp")), false, "被信号结束后自己删掉 .stryker-tmp");
    assert.equal(readFileSync(join(dir, "src/calc.ts"), "utf8"), mutated);
  } finally { rmSync(workDir(dir), { recursive: true, force: true }); dispose(dir); }
});

import { makeMonorepo } from "./fixture.mjs";

const changeBoth = (dir) => writeFiles(dir, { "packages/a/src/calc.ts": VITEST_SRC.replace("return n > 0;", "return n >= 1;"), "packages/b/src/calc.ts": VITEST_SRC.replace("return a + b;", "return b + a;") });

test.skipIf(skip)("多包仓库：Git 根没有 vitest 配置，不给 --project 退出 2；--project 成员只列它的条目（Git 根相对），抬头计成员外改动，JSON 带 project", () => {
  const dir = makeMonorepo();
  try {
    changeBoth(dir);
    const none = run(dir, ["--stryker-modules", fakeModules(dir)]);
    assert.equal(none.status, 2, none.stdout);
    assert.match(none.stderr, /^项目没有 vitest 配置也没有声明 vitest/);
    const r = run(dir, ["--project", "packages/a", "--stryker-modules", fakeModules(dir)]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\n引擎：Stryker 10\.1\.1（vitest）\n成员外改动 1 个文件，不在本轮\n/);
    const json = JSON.parse(run(dir, ["--project", "packages/a", "--stryker-modules", fakeModules(dir), "--format", "json"]).stdout);
    assert.equal(json.project, "packages/a");
    assert.deepEqual(json.mutate, ["packages/a/src/calc.ts:7-9"]);
    assert.equal(json.engine.reason, "项目根有 vitest.config.ts；Stryker 10.1.1 取自指定目录");
  } finally { dispose(dir); }
});

test.skipIf(skip)("--project 不存在、在 Git 根之外、不是目录：各退出 2 写原因", () => {
  const dir = makeMonorepo();
  try {
    for (const [value, message] of [["packages/zz", "--project 不存在：packages/zz"], ["..", "--project 在 Git 根之外：.."], ["packages/a/package.json", "--project 不是目录：packages/a/package.json"]]) {
      const r = run(dir, ["--project", value, "--stryker-modules", fakeModules(dir)]);
      assert.equal(r.status, 2, value);
      assert.equal(r.stderr.trim(), message);
    }
  } finally { dispose(dir); }
});

test.skipIf(skip)("单项目仓库上 --project . 与不给等价：JSON 除 project、生成时刻与资源读数外逐字段相等", () => {
  const dir = makeVitestRepo();
  try {
    writeFiles(dir, { "src/calc.ts": VITEST_SRC.replace("return n > 0;", "return n >= 1;") });
    const fake = fakeModules(dir);
    const strip = ({ project, generatedAt, resources, ...rest }) => ({ project, rest });
    const given = strip(JSON.parse(run(dir, ["--project", ".", "--stryker-modules", fake, "--format", "json"]).stdout));
    const plain = strip(JSON.parse(run(dir, ["--stryker-modules", fake, "--format", "json"]).stdout));
    assert.equal(given.project, ".");
    assert.equal(plain.project, null);
    assert.deepEqual(given.rest, plain.rest);
  } finally { dispose(dir); }
});

test.skipIf(skipReal)("多包仓库真跑一个成员：Stryker 在成员目录里跑，表格与位点路径相对 Git 根，分数有效，成员下没有留 .stryker-tmp，项目文件不变", () => {
  const dir = makeMonorepo(MODULES);
  try {
    changeBoth(dir);
    const r = strykerRun(dir, ["--project", "packages/a", "--stryker-modules", MODULES, "--json", join(dir, "out.json")]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /\| packages\/a\/src\/calc\.ts \| isPos \| [789] \|/);
    const json = JSON.parse(readFileSync(join(dir, "out.json"), "utf8"));
    assert.equal(json.summary.valid, true);
    assert.ok(json.sites.length > 0 && json.sites.every((s) => s.file === "packages/a/src/calc.ts" && s.unit === "isPos"), JSON.stringify(json.sites.map((s) => s.file + ":" + s.unit)));
    assert.ok(json.sites.some((s) => s.verdict === "killed"));
    const config = JSON.parse(readFileSync(join(workDir(join(dir, "packages/a")), "stryker-mutation.json"), "utf8"));
    assert.deepEqual(config.mutate, ["src/calc.ts:7-9"]);
    assert.equal(config.tempDirName, "../../.stryker-tmp-packages-a");
    assert.equal(existsSync(join(dir, "packages/a/.stryker-tmp")), false);
    assert.equal(existsSync(join(dir, ".stryker-tmp-packages-a")), false, "跑完删掉成员上两级的容器");
    assert.deepEqual(git(dir, "status --porcelain").split("\n").map((l) => l.trim()).sort(), ["?? out.json", "M packages/a/src/calc.ts", "M packages/b/src/calc.ts"]);
  } finally { rmSync(workDir(join(dir, "packages/a")), { recursive: true, force: true }); dispose(dir); }
});

/** 成员的用例从 Git 根下的 shared/ 取常量：沙箱比成员深时这条相对路径会指错，初跑就失败。 */
const SHARED_TEST = `import { test, expect } from "vitest";
import { ONE } from "../../../shared/one";
import { clamp, isPos } from "../src/calc";

test("clamp keeps inside", () => {
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(-1, 0, 10)).toBe(0);
  expect(clamp(11, 0, 10)).toBe(10);
});

test("isPos", () => {
  expect(isPos(ONE)).toBe(true);
  expect(isPos(-ONE)).toBe(false);
});
`;

test.skipIf(skipReal)("沙箱与成员同深度：成员用例经 ../../../ 引 Git 根下的文件照样跑通，分数与常量内联时一致，跑完没有容器残留", () => {
  const scores = [];
  for (const shared of [true, false]) {
    const dir = makeMonorepo(MODULES, ["packages/a"], shared ? { "shared/one.ts": "export const ONE = 1;\n", "packages/a/test/calc.test.ts": SHARED_TEST } : {});
    try {
      writeFiles(dir, { "packages/a/src/calc.ts": VITEST_SRC.replace("return n > 0;", "return n >= 1;") });
      const r = strykerRun(dir, ["--project", "packages/a", "--stryker-modules", MODULES, "--format", "json"]);
      assert.equal(r.status, 0, r.stderr + r.stdout);
      const json = JSON.parse(r.stdout);
      assert.equal(json.summary.valid, true, json.summary.invalidReason);
      scores.push([json.summary.killed, json.summary.survived, json.summary.uncovered]);
      assert.equal(existsSync(join(dir, ".stryker-tmp-packages-a")), false);
    } finally { rmSync(workDir(join(dir, "packages/a")), { recursive: true, force: true }); dispose(dir); }
  }
  assert.deepEqual(scores[0], scores[1]);
});

test.skipIf(skipReal)("--project 被 SIGTERM 结束：退出 143，成员上两级的容器已删，项目文件不变", async () => {
  const dir = makeMonorepo(MODULES, ["packages/a"]);
  const container = join(dir, ".stryker-tmp-packages-a");
  try {
    const mutated = VITEST_SRC.replace("  if (n < lo) return lo;", "  if (n < lo) { return lo; }");
    writeFiles(dir, { "packages/a/src/calc.ts": mutated });
    const child = spawn("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--project", "packages/a", "--stryker-modules", MODULES], { env: cleanEnv, stdio: ["ignore", "pipe", "pipe"] });
    const started = Date.now();
    while (!existsSync(container) && Date.now() - started < 20000) await new Promise((r) => setTimeout(r, 100));
    assert.ok(existsSync(container), "Stryker 已开始建容器");
    child.kill("SIGTERM");
    const code = await new Promise((r) => child.on("close", (c) => r(c)));
    assert.equal(code, 143);
    assert.equal(existsSync(container), false, "被信号结束后自己删掉容器");
    assert.equal(readFileSync(join(dir, "packages/a/src/calc.ts"), "utf8"), mutated);
  } finally { rmSync(workDir(join(dir, "packages/a")), { recursive: true, force: true }); dispose(dir); }
});
