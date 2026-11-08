// 直接打 lib/stryker.mjs：查找目录的顺序、依赖解析、运行器识别、引擎选择。不需要真的 Stryker，用假的 node_modules 目录。
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { searchDirs, resolveStryker, detectRunner, chooseEngine, SCRIPTS_MODULES, timeoutEntries, mergeRecheck, mapReport } from "../skills/slice-closeout/scripts/lib/stryker.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "pqw-stryker-"));
const pkg = (dir, name, extra = {}) => { mkdirSync(join(dir, name), { recursive: true }); writeFileSync(join(dir, name, "package.json"), JSON.stringify({ name, version: "9.9.9", ...extra })); };
/** 一个装齐了核心与 runner 的假 node_modules。 */
const fakeModules = (dir, { vitest = true, core = true, runner = true } = {}) => {
  if (core) pkg(dir, "@stryker-mutator/core", { bin: { stryker: "bin/stryker.js" } });
  if (runner) pkg(dir, "@stryker-mutator/vitest-runner");
  if (vitest) pkg(dir, "vitest", { version: "4.1.11" });
  return dir;
};
const NOWHERE = "/nonexistent/scripts/node_modules";

test("查找顺序：项目根、指定目录（参数优先于环境变量）、脚本目录；没给的跳过", () => {
  const dirs = searchDirs({ root: "/p", modulesDir: "/given", env: { PQW_STRYKER_MODULES: "/env" }, scriptsModules: "/s" });
  assert.deepEqual(dirs.map(([d]) => d), ["/p/node_modules", "/given", "/s"]);
  assert.deepEqual(searchDirs({ root: "/p", env: { PQW_STRYKER_MODULES: "/env" }, scriptsModules: "/s" }).map(([d]) => d), ["/p/node_modules", "/env", "/s"]);
  assert.deepEqual(searchDirs({ root: "/p", env: {}, scriptsModules: "/s" }).map(([d, from]) => from), ["项目 node_modules", "脚本目录 node_modules"]);
  assert.ok(SCRIPTS_MODULES.endsWith("/skills/slice-closeout/scripts/node_modules"), SCRIPTS_MODULES);
});

test("解析：项目有就取项目的；项目只有核心没有 runner 不算，落到指定目录；都没有返回 null", () => {
  const root = tmp(), given = tmp();
  try {
    assert.equal(resolveStryker({ root, env: {}, scriptsModules: NOWHERE }), null);
    fakeModules(given);
    const fromGiven = resolveStryker({ root, modulesDir: given, env: {}, scriptsModules: NOWHERE });
    assert.equal(fromGiven.from, "指定目录");
    assert.equal(fromGiven.coreBin, join(given, "@stryker-mutator/core/bin/stryker.js"));
    assert.equal(fromGiven.vitestVersion, "4.1.11");
    fakeModules(join(root, "node_modules"), { runner: false, vitest: false });
    assert.equal(resolveStryker({ root, modulesDir: given, env: {}, scriptsModules: NOWHERE }).from, "指定目录");
    fakeModules(join(root, "node_modules"), { vitest: false });
    const fromRoot = resolveStryker({ root, modulesDir: given, env: {}, scriptsModules: NOWHERE });
    assert.equal(fromRoot.from, "项目 node_modules");
    assert.equal(fromRoot.vitestVersion, null);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(given, { recursive: true, force: true }); }
});

test("运行器：配置文件优先并记下文件名；只有 package.json 声明也算；都没有返回 null；目录不存在返回 null", () => {
  const root = tmp();
  try {
    assert.equal(detectRunner(root), null);
    writeFileSync(join(root, "package.json"), JSON.stringify({ devDependencies: { vitest: "4.1.11" } }));
    assert.deepEqual(detectRunner(root), { name: "vitest", configFile: null, evidence: "package.json 声明了 vitest" });
    writeFileSync(join(root, "vitest.config.mts"), "");
    assert.equal(detectRunner(root).configFile, "vitest.config.mts");
    writeFileSync(join(root, "package.json"), JSON.stringify({ devDependencies: { jest: "1" } }));
    writeFileSync(join(root, "vite.config.ts"), "");
    rmSync(join(root, "vitest.config.mts"));
    assert.equal(detectRunner(root).evidence, "项目根有 vite.config.ts");
    assert.equal(detectRunner("/nonexistent/dir"), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("选引擎：只有 Stryker；项目没 vitest 抛 unavailable；有 vitest 缺依赖抛 unavailable 带装法；指定目录找到就用", () => {
  const root = tmp(), given = tmp();
  try {
    assert.throws(() => chooseEngine({ root, env: {}, scriptsModules: NOWHERE }), (e) => e.code === "unavailable" && /只支持 vitest 项目/.test(e.message));
    writeFileSync(join(root, "vitest.config.ts"), "");
    assert.throws(() => chooseEngine({ root, env: {}, scriptsModules: NOWHERE }), (e) => e.code === "unavailable" && new RegExp(`^找不到 Stryker：${join(root, "node_modules")}、${NOWHERE} 里都没有 .*npm ci --prefix`).test(e.message));
    fakeModules(given);
    const chosen = chooseEngine({ root, env: { PQW_STRYKER_MODULES: given }, scriptsModules: NOWHERE });
    assert.equal(chosen.name, "stryker");
    assert.equal(chosen.version, "9.9.9");
    assert.equal(chosen.runner, "vitest");
    assert.equal(chosen.configFile, "vitest.config.ts");
    assert.equal(chosen.modules.modulesDir, given);
    assert.match(chosen.reason, /^项目根有 vitest\.config\.ts；Stryker 9\.9\.9 取自指定目录$/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(given, { recursive: true, force: true }); }
});

import { mutateEntries, strykerConfig, categoryOf, mapReport, runStryker, tempDirIgnored, workDir, unitRanges } from "../skills/slice-closeout/scripts/lib/stryker.mjs";
import { readFileSync } from "node:fs";
import { makeRepo, dispose } from "./fixture.mjs";

test("mutate 条目：改动段写 路径:起-止，点名文件整份写路径，不在文件表里的不出", () => {
  const changed = new Map([["a.ts", [[2, 2], [10, 12]]], ["b.ts", [[1, 3]]], ["c.ts", [[5, 5]]]]);
  assert.deepEqual(mutateEntries(changed, ["b.ts"], ["a.ts", "b.ts"]), ["a.ts:2-2", "a.ts:10-12", "b.ts"]);
  assert.deepEqual(mutateEntries(new Map(), ["p.ts"], ["p.ts"]), ["p.ts"]);
});

test("范围按单元展开：改动行在单元里就取单元自己的全部行（扣掉嵌套单元），不在任何单元里的原样保留，相邻合并", () => {
  const units = [{ name: "<module>", startLine: 1, endLine: 30 }, { name: "a", startLine: 2, endLine: 10 }, { name: "a.inner", startLine: 5, endLine: 7 }, { name: "b", startLine: 12, endLine: 14 }];
  assert.deepEqual(unitRanges(units, [[3, 3]]), [[2, 4], [8, 10]], "a 自己的行扣掉嵌套的 5 到 7");
  assert.deepEqual(unitRanges(units, [[6, 6]]), [[5, 7]], "改在嵌套单元里只取嵌套单元");
  assert.deepEqual(unitRanges(units, [[20, 21]]), [[20, 21]], "模块级原样");
  assert.deepEqual(unitRanges(units, [[9, 13]]), [[2, 4], [8, 14]], "跨两个单元加中间的模块级行，相邻合并");
  assert.deepEqual(unitRanges(units, []), []);
  assert.deepEqual(unitRanges(units, [[20, 21], [3, 3]]), [[2, 4], [8, 10], [20, 21]], "改动段倒序给也按行号排");
});

test("配置：逐项按 spec；没有配置文件就不写 configFile；--timeout 映射 timeoutMS；增量按参数", () => {
  const c = strykerConfig({ entries: ["a.ts:1-2"], configFile: "vitest.config.ts", concurrency: 3, reportPath: "/r/m.json" });
  assert.deepEqual(c, { testRunner: "vitest", vitest: { configFile: "vitest.config.ts", related: false }, coverageAnalysis: "perTest", mutate: ["a.ts:1-2"], tempDirName: ".stryker-tmp", cleanTempDir: true, concurrency: 3, incremental: false, reporters: ["json", "progress-append-only"], jsonReporter: { fileName: "/r/m.json" }, thresholds: { high: 80, low: 60, break: null } });
  const d = strykerConfig({ entries: [], configFile: null, concurrency: 1, reportPath: "/r", timeoutMs: 5000, incremental: { file: "/i.json", force: true } });
  assert.equal("configFile" in d.vitest, false);
  assert.equal(d.timeoutMS, 5000);
  assert.deepEqual([d.incremental, d.incrementalFile, d.force], [true, "/i.json", true]);
});

test("类别：去掉变异器名的后缀并小写", () => {
  assert.deepEqual(["ConditionalExpression", "EqualityOperator", "BlockStatement", "StringLiteral", "ArrayDeclaration", "OptionalChaining", "Regex"].map(categoryOf), ["conditional", "equality", "block", "string", "array", "optional", "regex"]);
});

const REPORT = JSON.parse(readFileSync(new URL("./fixtures/stryker-report.json", import.meta.url), "utf8"));
const FIXTURE_UNITS = [{ name: "<module>", startLine: 1, endLine: 20, startByte: 0 }, { name: "clamp", startLine: 1, endLine: 5, startByte: 0 }, { name: "isPos", startLine: 7, endLine: 9, startByte: 120 }, { name: "unused", startLine: 11, endLine: 13, startByte: 170 }, { name: "label", startLine: 15, endLine: 17, startByte: 230 }];
const fixtureFiles = () => new Map([["src/calc.ts", { text: REPORT.files["src/calc.ts"].source, units: FIXTURE_UNITS, digests: new Map([["clamp", "d-clamp"]]) }]]);

test("映射样本：三种状态各有、原文按位置切、单元按行找、只收范围里的、范围外的段进未覆盖段", () => {
  const { sites, unmutated, unknown } = mapReport({ report: REPORT, files: fixtureFiles(), ranges: new Map([["src/calc.ts", [[2, 2], [12, 12], [19, 20]]]]) });
  assert.deepEqual(unknown, []);
  const byStatus = (v) => sites.filter((s) => s.verdict === v);
  assert.ok(byStatus("killed").length >= 1 && byStatus("survived").length >= 1 && byStatus("uncovered").length >= 1, JSON.stringify(sites.map((s) => s.verdict)));
  const lt = sites.find((s) => s.mutant === "n <= lo");
  assert.equal(lt.original, "n < lo");
  assert.equal(lt.unit, "clamp");
  assert.equal(lt.digest, "d-clamp");
  assert.equal(lt.category, "equality");
  assert.equal(lt.verdict, "survived");
  assert.equal(lt.line, 2);
  assert.equal(lt.id, "src/calc.ts:clamp:73:equality:n <= lo");
  assert.ok(sites.every((s) => [2, 12].includes(s.line)), "只收 2 与 12 两行");
  assert.ok(sites.every((s) => s.pinned === false), "没点名的文件位点 pinned 为 false");
  assert.equal(sites[0].line, 2, "样本里第 12 行的变异体排在前面，映射后按位置排，第 2 行在前");
  assert.deepEqual(sites.map((s) => s.start), [...sites.map((s) => s.start)].sort((a, b) => a - b), "同一文件按起点升序");
  const plus = sites.find((s) => s.line === 12 && s.category === "arithmetic");
  assert.deepEqual([plus.original, plus.mutant, plus.unit, plus.verdict, plus.runs], ["a + b", "a - b", "unused", "uncovered", 0]);
  assert.deepEqual(unmutated, [{ file: "src/calc.ts", lines: [19, 20], unit: null, reason: "引擎没有在这段生成变异体" }]);
  assert.equal(sites.filter((s) => s.line === 2).map((s) => s.start).every((v, i, a) => i === 0 || a[i - 1] <= v), true, "按位置排序");
  assert.equal(lt.seconds, 0.002, "duration 毫秒四舍五入后换成秒");
  assert.equal(plus.seconds, null, "没有 duration 就是 null");
});

test("映射边界：单元首行的变异体归该单元；嵌套时取最小的单元；不在任何单元里归 <module>；单元内偏移减去单元起点；长原文截到 37 字加省略号；改动段在单元里却没有变异体时记单元名", () => {
  const report = JSON.parse(JSON.stringify(REPORT));
  const ms = report.files["src/calc.ts"].mutants;
  ms.push({ id: "x1", mutatorName: "StringLiteral", replacement: '""', status: "Survived", location: { start: { line: 19, column: 1 }, end: { line: 19, column: 3 } }, coveredBy: [], killedBy: [], static: false });
  const files = fixtureFiles();
  files.get("src/calc.ts").units = [...FIXTURE_UNITS, { name: "clamp.inner", startLine: 2, endLine: 2, startByte: 69 }];
  const { sites, unmutated } = mapReport({ report, files, ranges: new Map([["src/calc.ts", [[1, 2], [4, 4], [8, 8], [19, 19]]]]) });
  const block = sites.find((s) => s.line === 1 && s.category === "block");
  assert.equal(block.unit, "clamp", "首行归 clamp，不是 <module>");
  assert.equal(block.original.length, 38);
  assert.ok(block.original.endsWith("…"), block.original);
  assert.ok(sites.filter((s) => s.line === 2).every((s) => s.unit === "clamp.inner"), "嵌套取最小单元");
  const pos = sites.find((s) => s.line === 8);
  assert.equal(pos.unit, "isPos");
  assert.equal(pos.id.split(":")[2], String(pos.start - 120), "偏移相对单元起点");
  const mod = sites.find((s) => s.line === 19);
  assert.equal(mod.unit, "<module>");
  assert.equal(mod.verdict, "survived");
  report.files["src/lead.ts"] = { language: "typescript", source: "\nconst a = 1;\n", mutants: [{ id: "y1", mutatorName: "ArithmeticOperator", replacement: "2", status: "Killed", location: { start: { line: 2, column: 11 }, end: { line: 2, column: 12 } }, coveredBy: ["0"], killedBy: ["0"], static: false }] };
  files.set("src/lead.ts", { text: "\nconst a = 1;\n", units: [{ name: "<module>", startLine: 1, endLine: 3, startByte: 0 }], digests: new Map() });
  const lead = mapReport({ report, files, ranges: new Map([["src/lead.ts", [[2, 2]]]]) }).sites.find((s) => s.file === "src/lead.ts");
  assert.deepEqual([lead.original, lead.start], ["1", 11], "文件以空行开头时按行列算偏移不出错");
  assert.deepEqual(unmutated, [{ file: "src/calc.ts", lines: [4, 4], unit: "clamp", reason: "引擎没有在这段生成变异体" }]);
});

test("映射：点名文件全收；Timeout 记杀死（timeout）、RuntimeError 与 CompileError 记未跑并带原因；报告里没有的文件整段进未覆盖段", () => {
  const report = JSON.parse(JSON.stringify(REPORT));
  const ms = report.files["src/calc.ts"].mutants;
  ms[0].status = "Timeout"; ms[1].status = "RuntimeError"; ms[2].status = "CompileError";
  const files = fixtureFiles();
  files.set("src/other.ts", { text: "export const x = 1;\n", units: [{ name: "<module>", startLine: 1, endLine: 1, startByte: 0 }], digests: new Map() });
  ms[3].status = "Weird";
  const { sites, unmutated, unknown } = mapReport({ report, files, ranges: new Map([["src/other.ts", [[1, 1]]]]), pinned: ["src/calc.ts"] });
  assert.equal(sites.length, ms.length);
  assert.ok(sites.every((s) => s.pinned));
  const byId = (id) => sites.find((s) => s.strykerId === id);
  assert.deepEqual([byId(ms[3].id).verdict, byId(ms[3].id).reason, byId(ms[3].id).unknownStatus], ["notRun", "未知状态 Weird", "Weird"]);
  assert.deepEqual(unknown, ["Weird"], "映射表没有的状态单列，调用方据此判测量无效");
  assert.deepEqual([byId(ms[0].id).verdict, byId(ms[0].id).reason], ["killed", "timeout"]);
  assert.deepEqual([byId(ms[1].id).verdict, byId(ms[1].id).reason], ["notRun", "runtime error"]);
  assert.deepEqual([byId(ms[2].id).verdict, byId(ms[2].id).reason], ["notRun", "compile error"]);
  assert.deepEqual(unmutated, [{ file: "src/other.ts", lines: [1, 1], unit: null, reason: "引擎没有在这段生成变异体" }]);
});

test("起进程：输出进日志、进度行转出、增量摘要行解析成 reused、tail 是末尾；kill 能结束", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pqw-stryker-run-"));
  try {
    const fake = join(dir, "fake.js");
    writeFileSync(fake, 'const t = Date.now(); while (Date.now() - t < 150);\nconsole.log("Mutation testing 50% (elapsed: <1m) 1/2 tested");\nconsole.error("\\x1b[32mINFO\\x1b[39m Result:\\t\\t22 of 23 mutant result(s) are reused.");\nconsole.log("INFO DryRunExecutor Initial test run succeeded. Ran 4 tests in 0 seconds (net 5.5 ms, overhead 403.4 ms).");\nconsole.log("Done in 1 seconds.");\nprocess.exit(process.argv[2] === "run" ? 0 : 9);\n');
    const progress = [];
    const r = await runStryker({ root: dir, coreBin: fake, configPath: "c.json", logPath: join(dir, "log.txt"), onProgress: (l) => progress.push(l) }).done;
    assert.equal(r.status, 0);
    assert.equal(r.dryRunSeconds, 0.409, "初跑用时取日志 net 加 overhead 毫秒");
    assert.ok(r.seconds >= 0.1 && r.seconds < 10 && r.seconds === Math.round(r.seconds * 10) / 10, `seconds 是一位小数的秒数：${r.seconds}`);
    assert.equal(r.reused, 22);
    assert.deepEqual(progress, ["Mutation testing 50% (elapsed: <1m) 1/2 tested"]);
    assert.match(r.tail, /INFO Result:\t\t22 of 23 mutant result\(s\) are reused\./);
    assert.match(r.tail, /Done in 1 seconds\./);
    assert.equal(r.tail.includes("\x1b"), false, "颜色码已去掉");
    assert.match(readFileSync(join(dir, "log.txt"), "utf8"), /Mutation testing 50%/);
    writeFileSync(fake, "setInterval(() => {}, 1000);\n");
    const long = runStryker({ root: dir, coreBin: fake, configPath: "c.json", logPath: join(dir, "log2.txt") });
    long.kill();
    const k = await long.done;
    assert.equal(k.signal, "SIGTERM");
    assert.equal(k.reused, null);
    assert.equal(k.dryRunSeconds, null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test(".stryker-tmp 是否被忽略；工作目录在系统临时目录下且按仓库稳定", () => {
  const repo = makeRepo({ "a.txt": "x\n" });
  try {
    assert.equal(tempDirIgnored(repo), false);
    writeFileSync(join(repo, ".gitignore"), ".stryker-tmp\n");
    assert.equal(tempDirIgnored(repo), true);
    assert.ok(workDir(repo).startsWith(join(tmpdir(), "pqw-mutation")));
    assert.equal(workDir(repo), workDir(repo));
    assert.notEqual(workDir(repo), workDir(repo + "x"));
  } finally { dispose(repo); }
});

import { incrementalFor, rememberFingerprint, strykerFingerprint } from "../skills/slice-closeout/scripts/lib/stryker.mjs";
import { TOOL_VERSION } from "../skills/slice-closeout/scripts/lib/version.mjs";

test("增量：没有记录 force；记过同样的指纹不 force；指纹变了 force；增量文件在工作目录；Stryker 指纹带工具版本、vitest 与配置、Stryker 版本", () => {
  const dir = mkdtempSync(join(tmpdir(), "pqw-incr-"));
  try {
    const fp = { toolVersion: "0.7.0", testCommand: "vitest@4.1.11 + vitest.config.ts", testFilesDigest: "abc", strykerVersion: "10.1.1" };
    const first = incrementalFor(dir, fp);
    assert.deepEqual([first.file, first.force, first.previous], [join(dir, "incremental.json"), true, null]);
    rememberFingerprint(dir, fp);
    const second = incrementalFor(dir, { ...fp });
    assert.deepEqual([second.force, second.previous], [false, fp]);
    assert.equal(incrementalFor(dir, { ...fp, testFilesDigest: "changed" }).force, true);
    assert.equal(incrementalFor(dir, { ...fp, strykerVersion: "10.2.0" }).force, true);
    const repo = makeRepo({ "test/a.test.ts": "x\n" });
    try {
      const got = strykerFingerprint(repo, { version: "10.1.1", modules: { vitestVersion: "4.1.11" }, configFile: "vitest.config.ts" });
      assert.deepEqual(Object.keys(got), ["toolVersion", "testCommand", "testFilesDigest", "strykerVersion"]);
      assert.deepEqual([got.toolVersion, got.testCommand, got.strykerVersion], [TOOL_VERSION, "vitest@4.1.11 + vitest.config.ts", "10.1.1"]);
      assert.equal(strykerFingerprint(repo, { version: "10.1.1", modules: { vitestVersion: null }, configFile: null }).testCommand, "vitest@? + 无配置");
    } finally { dispose(repo); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- 超时复核的两个纯函数。位点的 id 由 mutantSite 算，这里给 entry 最小的 text 与 units。
const ENTRY = { text: "a\nb\nc\nd\ne\n", units: [{ name: "f", startLine: 1, endLine: 5, startByte: 0 }] };
const at = (line, endLine = line) => ({ start: { line, column: 1 }, end: { line: endLine, column: 2 } });
const m = (id, status, line, replacement = "x", endLine = line) => ({ id, mutatorName: "EqualityOperator", replacement, status, location: at(line, endLine) });

test("timeoutEntries：只取 Timeout，整行、相邻合并、跨行展开、只看给的文件", () => {
  const report = { files: { "a.ts": { mutants: [m("4", "Timeout", 5, "y", 7), m("2", "Timeout", 3), m("3", "Killed", 4), m("1", "Timeout", 2)] }, "b.ts": { mutants: [m("5", "Timeout", 1)] } } };
  const files = new Map([["a.ts", ENTRY]]);
  assert.deepEqual(timeoutEntries(report, files, new Map([["a.ts", [[1, 9]]]])), ["a.ts:2-3", "a.ts:5-7"], "报告里的顺序不影响，相邻合并");
  assert.deepEqual(timeoutEntries(report, files, new Map([["a.ts", [[2, 3]]]])), ["a.ts:2-3"], "范围外的超时不算：增量会把上一轮范围外的结果写进报告");
  assert.deepEqual(timeoutEntries(report, files, new Map(), ["a.ts"]), ["a.ts:2-3", "a.ts:5-7"], "点名的文件整份算");
  assert.deepEqual(timeoutEntries(report, files), [], "没给范围就没有本轮位点");
  assert.deepEqual(timeoutEntries(null, files, new Map([["a.ts", [[1, 9]]]])), []);
  assert.deepEqual(timeoutEntries({ files: {} }, files, new Map([["a.ts", [[1, 9]]]])), [], "报告里没有这个文件");
});

test("mergeRecheck：按位点 id 并入，Killed 与 Survived 改裁定记 recheck，仍 Timeout 保持，没对上或别的状态记未复核且不动", () => {
  const files = new Map([["a.ts", ENTRY]]);
  const site = (id, replacement) => ({ id: `a.ts:f:${id}:equality:${replacement}`, verdict: "killed", reason: "timeout" });
  // 行 2 的偏移是 2，行 3 是 4，行 4 是 6，行 5 是 8。
  const sites = [site(2, "p"), site(4, "q"), site(6, "r"), site(8, "s"), site(6, "t"), { id: "a.ts:f:0:equality:z", verdict: "killed", reason: null }];
  const second = { files: { "a.ts": { mutants: [m("9", "Killed", 2, "p"), m("8", "Survived", 3, "q"), m("7", "Timeout", 4, "r"), m("6", "RuntimeError", 5, "s"), m("5", "Timeout", 4, "t")] } } };
  assert.deepEqual(mergeRecheck(sites, second, files), { total: 5, killed: 1, survived: 1, timedOut: 2, notRun: 1, unknown: [] });
  assert.deepEqual(sites.map((s) => [s.verdict, s.reason]), [["killed", "recheck"], ["survived", "recheck"], ["killed", "timeout"], ["killed", "timeout"], ["killed", "timeout"], ["killed", null]]);
  assert.deepEqual(mergeRecheck([site(2, "p")], null, files), { total: 1, killed: 0, survived: 0, timedOut: 0, notRun: 1, unknown: [] });
  assert.deepEqual(mergeRecheck([site(2, "p")], { files: {} }, files), { total: 1, killed: 0, survived: 0, timedOut: 0, notRun: 1, unknown: [] }, "第二轮报告里没有这个文件");
  assert.deepEqual(mergeRecheck([site(2, "p")], { files: { "a.ts": { mutants: [m("1", "Weird", 2, "p")] } } }, files), { total: 1, killed: 0, survived: 0, timedOut: 0, notRun: 1, unknown: ["Weird"] }, "映射表没有的状态记未复核并报出来");
});

test("mapReport：单元表里没有 <module> 时顶层行的变异体挂到 <module>，不崩（本仓库 lib/stryker.mjs 顶层常量上的变异体曾让一轮在映射时崩掉）", () => {
  const entry = { text: "const A = [1];\nexport function f() { return 1; }\n", units: [{ name: "f", startLine: 2, endLine: 2, startByte: 15 }] };
  const report = { files: { "a.ts": { mutants: [{ id: "1", mutatorName: "ArrayDeclaration", replacement: "[]", status: "Killed", location: { start: { line: 1, column: 11 }, end: { line: 1, column: 14 } } }] } } };
  const { sites, unmutated } = mapReport({ report, files: new Map([["a.ts", entry]]), ranges: new Map([["a.ts", [[1, 1]]]]) });
  assert.deepEqual(sites.map((s) => [s.unit, s.id, s.original, s.verdict]), [["<module>", "a.ts:<module>:10:array:[]", "[1]", "killed"]]);
  assert.deepEqual(unmutated, []);
});

test("mapReport：行同时在外层与内层单元里时挂到更小的那个", () => {
  const text = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
  const entry = { text, units: [{ name: "outer", startLine: 1, endLine: 10, startByte: 0 }, { name: "outer.inner", startLine: 8, endLine: 10, startByte: 49 }] };
  const report = { files: { "a.ts": { mutants: [{ id: "1", mutatorName: "StringLiteral", replacement: '""', status: "Survived", location: { start: { line: 9, column: 1 }, end: { line: 9, column: 6 } } }] } } };
  const { sites } = mapReport({ report, files: new Map([["a.ts", entry]]), ranges: new Map([["a.ts", [[9, 9]]]]) });
  assert.deepEqual(sites.map((s) => [s.unit, s.original]), [["outer.inner", "line9"]]);
});
