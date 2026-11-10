// 差分变异的五处口径（不起 Stryker）：大单元的变异范围、增量指纹、超时复核上限、运行时报错、指定测试配置；另有沙箱预检的包装脚本。
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeVitestRepo, writeFiles, dispose, tsPath } from "./fixture.mjs";
import { unitRanges, largeUnits, timeoutEntries, limitRecheck, strykerConfig, buildEnv, PREFLIGHT_ENV, sandboxBuild, failedBaseline, baselineFailure, SANDBOX_BUILD, buildCommandFor } from "../skills/slice-closeout/scripts/lib/stryker.mjs";
import { summarize, formatMutation } from "../skills/slice-closeout/scripts/lib/mutation.mjs";

const SCRIPT = new URL("../skills/slice-closeout/scripts/mutation.mjs", import.meta.url).pathname;
const TS = tsPath();
const skip = TS ? false : "没有 typescript，设 PQW_TS";
const cleanEnv = { ...process.env, PQW_STRYKER_MODULES: "/nonexistent/modules" };
const fakeModules = (dir) => { const fake = join(dir, "fake-modules"); for (const name of ["@stryker-mutator/core", "@stryker-mutator/vitest-runner", "vitest"]) { mkdirSync(join(fake, name), { recursive: true }); writeFileSync(join(fake, name, "package.json"), JSON.stringify({ name, version: "10.1.1" })); } return fake; };
const planJson = (dir, args) => { const r = spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--plan-only", "--format", "json", "--stryker-modules", fakeModules(dir), ...args], { encoding: "utf8", env: cleanEnv }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
const sha = (text) => createHash("sha256").update(text).digest("hex");

// ---- 5. 大单元的变异范围

test("大单元：自有行数超过上限时只取改动行与包住它的最小嵌套函数（匿名回调也算），不再取整个单元；上限以内照旧取单元自己的全部行", () => {
  const units = [{ name: "make", startLine: 1, endLine: 300 }, { name: "make.named", startLine: 200, endLine: 210 }, { name: "small", startLine: 302, endLine: 306 }];
  const spans = [[1, 300], [100, 110], [104, 106], [200, 210], [302, 306]];
  assert.deepEqual(unitRanges(units, [[105, 105]], { maxLines: 200, spans }), [[104, 106]], "最小的匿名回调");
  assert.deepEqual(unitRanges(units, [[50, 51]], { maxLines: 200, spans }), [[50, 51]], "不在任何嵌套函数里：只取改动行");
  assert.deepEqual(unitRanges(units, [[205, 205]], { maxLines: 200, spans }), [[200, 210]], "落在有名的内层单元上照旧取那个单元");
  assert.deepEqual(unitRanges(units, [[303, 303]], { maxLines: 200, spans }), [[302, 306]], "小单元照旧取整个单元");
  assert.deepEqual(unitRanges(units, [[105, 105]], { maxLines: 400, spans }), [[1, 199], [211, 300]], "上限放宽后取整个单元自己的行");
  assert.deepEqual(largeUnits(units, [[105, 105], [303, 303]], 200), [{ unit: "make", ownLines: 289 }]);
  assert.deepEqual(largeUnits(units, [[303, 303]], 200), []);
  assert.deepEqual(unitRanges(units, [[105, 105], [303, 304]], { maxLines: 0, spans }), [[105, 105], [303, 304]], "上限 0：每个单元都算超过，只留改动行");
});

const BIG = `export function big(n: number) {\n  let t = n;\n  [1].forEach((x) => {\n    t += x;\n  });\n${"  t += 1;\n".repeat(250)}  return t;\n}\n`;

test.skipIf(skip)("缺省只打改动行；--whole-units 扩到单元，--unit-max-lines 缺省 200 收窄大单元并写进抬头与 JSON narrowed，给大了取整个单元", () => {
  const dir = makeVitestRepo();
  try {
    writeFiles(dir, { "src/big.ts": BIG });
    spawnSync("git", ["add", "-A"], { cwd: dir }); spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "big"], { cwd: dir });
    const lines = BIG.split("\n"); lines[3] = "    t -= x;"; lines[99] = "  t += 2;";
    writeFiles(dir, { "src/big.ts": lines.join("\n") });
    const lean = planJson(dir, []);
    assert.deepEqual([lean.mutate, lean.narrowed], [["src/big.ts:4-4", "src/big.ts:100-100"], []]);
    assert.ok(!lean.engine.notes.some((n) => n.startsWith("大单元")), JSON.stringify(lean.engine.notes));
    const json = planJson(dir, ["--whole-units"]);
    assert.deepEqual(json.mutate, ["src/big.ts:3-5", "src/big.ts:100-100"]);
    assert.deepEqual(json.narrowed, [{ file: "src/big.ts", unit: "big", ownLines: 257 }]);
    assert.ok(json.engine.notes.includes("大单元只变异改动行与包住它的最小嵌套函数：src/big.ts big（自有 257 行，上限 200）"), JSON.stringify(json.engine.notes));
    const wide = planJson(dir, ["--whole-units", "--unit-max-lines", "300"]);
    assert.deepEqual([wide.mutate, wide.narrowed], [["src/big.ts:1-257"], []]);
  } finally { dispose(dir); }
});

// ---- 7. 增量指纹

test.skipIf(skip)("增量指纹：带测试配置文件的内容摘要；给了 --build-command 时带构建产物目录（缺省 dist/，--build-output 可改）的内容摘要；任一变了指纹就变", () => {
  const dir = makeVitestRepo();
  try {
    const first = planJson(dir, []).fingerprint;
    assert.equal(first.testConfigDigest, sha(readFileSync(join(dir, "vitest.config.ts"), "utf8")));
    assert.equal("buildOutputDigest" in first, false, "没给构建命令就不看产物");
    writeFiles(dir, { "vitest.config.ts": readFileSync(join(dir, "vitest.config.ts"), "utf8") + "// 只改内容不改名\n" });
    assert.notEqual(planJson(dir, []).fingerprint.testConfigDigest, first.testConfigDigest);
    writeFiles(dir, { "dist/calc.js": "export const a = 1;\n" });
    const built = planJson(dir, ["--build-command", "true"]).fingerprint;
    assert.equal(typeof built.buildOutputDigest, "string");
    writeFiles(dir, { "dist/calc.js": "export const a = 2;\n" });
    assert.notEqual(planJson(dir, ["--build-command", "true"]).fingerprint.buildOutputDigest, built.buildOutputDigest, "dist 的内容变了");
    writeFiles(dir, { "out/x.js": "1\n" });
    const other = planJson(dir, ["--build-command", "true", "--build-output", "out"]).fingerprint.buildOutputDigest;
    writeFiles(dir, { "out/x.js": "2\n" });
    assert.notEqual(planJson(dir, ["--build-command", "true", "--build-output", "out"]).fingerprint.buildOutputDigest, other, "--build-output 指的目录");
  } finally { dispose(dir); }
});

// ---- 8. 超时复核上限

const site = (over) => ({ id: "a.ts:f:0:x:y", file: "a.ts", unit: "f", line: 1, original: "a", mutant: "b", category: "x", verdict: "killed", reason: null, strykerId: "0", ...over });

test("超时复核上限：前 limit 个超时位点复核，其余记「超时未复核」，成员测量无效；复核条目只含选中的", () => {
  const sites = Array.from({ length: 10 }, (_, i) => site({ verdict: "killed", reason: "timeout", strykerId: String(i), line: i + 1 }));
  const kept = limitRecheck(sites, 8);
  assert.deepEqual([...kept], ["0", "1", "2", "3", "4", "5", "6", "7"]);
  assert.deepEqual(sites.slice(8).map((s) => [s.verdict, s.reason]), [["notRun", "超时未复核"], ["notRun", "超时未复核"]]);
  const { summary } = summarize(sites);
  assert.deepEqual([summary.valid, summary.invalidReason, summary.score], [false, "超时未复核 2 个", null]);
  const report = { files: { "a.ts": { mutants: [0, 1, 2].map((i) => ({ id: String(i), status: "Timeout", location: { start: { line: i + 1, column: 1 }, end: { line: i + 1, column: 2 } } })) } } };
  assert.deepEqual(timeoutEntries(report, new Map([["a.ts", {}]]), new Map([["a.ts", [[1, 9]]]]), [], new Set(["0", "2"])), ["a.ts:1-1", "a.ts:3-3"]);
  const none = [site({ reason: "timeout" })];
  assert.deepEqual([...limitRecheck(none, 0)], []);
  assert.equal(none[0].reason, "超时未复核", "上限 0 时一个都不复核");
});

// ---- 9. 运行时报错

test("运行时报错：有 RuntimeError 的位点时成员测量无效、不出分数，表后列出这些位点", () => {
  const sites = [site({ verdict: "killed" }), site({ verdict: "survived" }), site({ verdict: "notRun", reason: "runtime error", line: 7, original: "x > 0", mutant: "true" })];
  const r = summarize(sites);
  assert.deepEqual([r.summary.valid, r.summary.invalidReason, r.summary.score], [false, "运行时报错 1 个位点", null]);
  assert.deepEqual(r.runtimeErrors, [{ file: "a.ts", unit: "f", line: 7, original: "x > 0", mutant: "true" }]);
  const text = formatMutation({ base: "abcdef1234567890", baseGiven: null, planOnly: false, baseline: { passed: true }, sites, ...r, unmutated: [], recheck: null });
  assert.match(text, /位点 3：测量无效（运行时报错 1 个位点）\n/);
  assert.match(text, /\n\n运行时报错的位点：\n- a\.ts:7 f：x > 0 换成 true$/);
  assert.equal(summarize([site({ verdict: "notRun", reason: "compile error" }), site()]).summary.valid, true, "CompileError 不触发");
});

// ---- 10. 指定测试配置

test.skipIf(skip)("--vitest-config：覆盖自动找到的配置，进指纹与引擎说明；文件不在退出 2", () => {
  const dir = makeVitestRepo();
  try {
    const fast = 'import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { include: ["test/calc.test.ts"] } });\n';
    writeFiles(dir, { "vitest.fast.config.ts": fast });
    const json = planJson(dir, ["--vitest-config", "vitest.fast.config.ts"]);
    assert.equal(json.fingerprint.testCommand, "vitest@10.1.1 + vitest.fast.config.ts");
    assert.equal(json.fingerprint.testConfigDigest, sha(fast));
    assert.match(json.engine.reason, /^指定了 --vitest-config vitest\.fast\.config\.ts；Stryker 10\.1\.1 取自指定目录$/);
    const missing = spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--plan-only", "--stryker-modules", fakeModules(dir), "--vitest-config", "nope.ts"], { encoding: "utf8", env: cleanEnv });
    assert.equal(missing.status, 2);
    assert.equal(missing.stderr.trim(), "--vitest-config 不存在：nope.ts（相对项目目录）");
  } finally { dispose(dir); }
});

// ---- 6. 沙箱预检的包装脚本（真跑见 readings-preflight.test.mjs）

test("沙箱预检：配置走包装脚本但不关 Stryker 的链接；包装脚本链好依赖、用同一份配置跑一遍测试，没跑通写标记带失败的测试文件；只为预检链的依赖跑完撤掉", () => {
  const config = strykerConfig({ entries: [], configFile: null, concurrency: 1, reportPath: "/r", preflight: true });
  assert.equal(config.buildCommand, buildCommandFor(SANDBOX_BUILD));
  assert.equal("symlinkNodeModules" in config, false, "没给构建命令时依赖仍由 Stryker 自己链");
  const dir = mkdtempSync(join(tmpdir(), "pqw-readings-"));
  try {
    const project = join(dir, "project"), sandbox = join(dir, "sandbox"), work = join(dir, "work");
    mkdirSync(join(project, "node_modules"), { recursive: true }); mkdirSync(join(sandbox, "test"), { recursive: true }); mkdirSync(work);
    // 假的 vitest：记下参数与当时沙箱里有没有 node_modules，按 FAIL 决定退出码并写 JSON 报告。
    const fake = join(dir, "fake-vitest.mjs");
    writeFileSync(fake, `import { writeFileSync, existsSync } from "node:fs";
const out = process.argv.find((a) => a.startsWith("--outputFile=")).slice("--outputFile=".length);
writeFileSync(${JSON.stringify(join(dir, "args.json"))}, JSON.stringify({ args: process.argv.slice(2), linked: existsSync("node_modules") }));
const fail = process.env.FAIL === "1";
writeFileSync(out, JSON.stringify({ testResults: [{ name: process.cwd() + "/test/a.test.ts", status: fail ? "failed" : "passed" }, { name: process.cwd() + "/test/b.test.ts", status: "passed" }] }));
process.exit(fail ? 1 : 0);
`);
    const env = (extra) => ({ ...process.env, ...buildEnv({ projectDir: project, command: null, mark: join(work, "build-failed"), preflight: { vitest: fake, configFile: "vitest.fast.config.ts", report: join(work, "preflight.json"), mark: join(work, "preflight-failed") } }), ...extra });
    assert.equal(sandboxBuild({ cwd: sandbox, env: env({ FAIL: "0" }), stdio: "ignore" }), 0);
    const seen = JSON.parse(readFileSync(join(dir, "args.json"), "utf8"));
    assert.equal(seen.linked, true, "预检时依赖已链进沙箱");
    assert.deepEqual(seen.args.slice(0, 3), ["run", "--config", "vitest.fast.config.ts"]);
    assert.equal(existsSync(join(sandbox, "node_modules")), false, "没给构建命令：预检用完撤掉，留给 Stryker 自己链");
    assert.equal(existsSync(join(work, "preflight-failed")), false);
    assert.equal(sandboxBuild({ cwd: sandbox, env: env({ FAIL: "1" }), stdio: "ignore" }), 1);
    assert.deepEqual(JSON.parse(readFileSync(join(work, "preflight-failed"), "utf8")), { status: 1, files: ["test/a.test.ts"] });
    const baseline = failedBaseline({ seconds: 1, tail: "t", logPath: "/l", buildFailed: false, preflight: { status: 1, files: ["test/a.test.ts"] } });
    assert.deepEqual([baseline.preflightFailed, baseline.failedFiles, baselineFailure(baseline)], [true, ["test/a.test.ts"], "沙箱预检没通过"]);
    const text = formatMutation({ base: "abcdef1234567890", baseGiven: null, planOnly: false, baseline, sites: [], ...summarize([], { baselinePassed: false }), unmutated: [], recheck: null });
    assert.match(text, /\n没跑通的测试文件：\n- test\/a\.test\.ts\n/);
    assert.equal(lstatSync(project).isDirectory(), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("沙箱预检有时限：用例挂住时到时限就算没跑通，标记写「超时」，不无限等", () => {
  const dir = mkdtempSync(join(tmpdir(), "pqw-readings-"));
  try {
    const project = join(dir, "project"), sandbox = join(dir, "sandbox"), hang = join(dir, "hang.mjs");
    mkdirSync(project); mkdirSync(sandbox);
    writeFileSync(hang, "setTimeout(() => {}, 60000);\n");
    const env = { ...process.env, ...buildEnv({ projectDir: project, command: null, mark: join(dir, "b"), preflight: { vitest: hang, configFile: null, report: join(dir, "p.json"), mark: join(dir, "p-failed") } }) };
    const t0 = Date.now();
    assert.notEqual(sandboxBuild({ cwd: sandbox, env, stdio: "ignore", preflightTimeoutMs: 500 }), 0);
    assert.ok(Date.now() - t0 < 20000, `到时限就停：${Date.now() - t0}ms`);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "p-failed"), "utf8")), { status: "超时", files: [] });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
