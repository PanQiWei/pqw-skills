// 命令面的超时复核：用假的 Stryker 二进制（tests/fixtures/fake-stryker.mjs）写事先准备的两份报告，核第二轮的配置、并入后的裁定、抬头与 JSON。
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { makeVitestRepo, writeFiles, dispose, tsPath, git } from "./fixture.mjs";
import { workDir } from "../skills/slice-closeout/scripts/lib/stryker.mjs";

const SCRIPT = new URL("../skills/slice-closeout/scripts/mutation.mjs", import.meta.url).pathname;
const FAKE = new URL("./fixtures/fake-stryker.mjs", import.meta.url).pathname;
const TS = tsPath();
const skip = TS ? false : "没有 typescript，设 PQW_TS";

const mutant = (id, mutatorName, replacement, status) => ({ id, mutatorName, replacement, status, static: false, testsCompleted: 1, duration: 12.5, location: { start: { line: 8, column: 10 }, end: { line: 8, column: 16 } } });
const report = (mutants) => JSON.stringify({ schemaVersion: "1.0", files: { "src/calc.ts": { language: "typescript", mutants } } });
const FIRST = report([mutant("10", "ConditionalExpression", "true", "Killed"), mutant("12", "EqualityOperator", "n > 1", "Timeout"), mutant("13", "EqualityOperator", "n < 1", "Timeout")]);
const SECOND = report([mutant("0", "EqualityOperator", "n > 1", "Killed"), mutant("1", "EqualityOperator", "n < 1", "Survived")]);
const NO_TIMEOUT = report([mutant("10", "ConditionalExpression", "true", "Killed")]);

/** 一个 vitest 夹具项目（改了 isPos 的第 8 行），加一个放在仓库外的假 node_modules，核心包的 bin 指向假二进制。 */
function setup(reports) {
  const dir = makeVitestRepo();
  writeFiles(dir, { "src/calc.ts": readFileSync(join(dir, "src/calc.ts"), "utf8").replace("return n > 0;", "return n >= 1;") });
  const side = mkdtempSync(join(tmpdir(), "pqw-fake-stryker-"));
  const modules = join(side, "node_modules");
  for (const name of ["@stryker-mutator/vitest-runner", "vitest"]) { mkdirSync(join(modules, name), { recursive: true }); writeFileSync(join(modules, name, "package.json"), JSON.stringify({ name, version: "10.1.1" })); }
  mkdirSync(join(modules, "@stryker-mutator/core/bin"), { recursive: true });
  writeFileSync(join(modules, "@stryker-mutator/core/package.json"), JSON.stringify({ name: "@stryker-mutator/core", version: "10.1.1", type: "module", bin: { stryker: "bin/stryker.js" } }));
  writeFileSync(join(modules, "@stryker-mutator/core/bin/stryker.js"), `import ${JSON.stringify(FAKE)};\n`);
  const paths = reports.map((text, i) => { const p = join(side, `report-${i}.json`); writeFileSync(p, text); return p; });
  const state = join(side, "state");
  const run = (...args) => {
    const r = spawnSync("node", [SCRIPT, "--repo", dir, "--ts", TS, "--base", "HEAD", "--stryker-modules", modules, "--json", join(side, "out.json"), ...args], { encoding: "utf8", env: { ...process.env, PQW_FAKE_REPORTS: paths.join(","), PQW_FAKE_STATE: state } });
    return { ...r, json: existsSync(join(side, "out.json")) ? JSON.parse(readFileSync(join(side, "out.json"), "utf8")) : null, calls: existsSync(state) ? Number(readFileSync(state, "utf8")) : 0, seen: (name) => JSON.parse(readFileSync(join(workDir(dir), `stryker-${name}.json.seen`), "utf8")) };
  };
  return { dir, side, run, cleanup: () => { dispose(dir); dispose(side); } };
}

test.skipIf(skip)("两个超时复核成一杀死一存活：第二轮只打那一行、一个进程、不进增量、时限按 --recheck-timeout；抬头与 JSON 的复核段，其中超时归零，工作树不变", () => {
  const f = setup([FIRST, SECOND]);
  try {
    const r = f.run("--recheck-timeout", "90s");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.calls, 2);
    const second = r.seen("recheck");
    assert.deepEqual([second.mutate, second.concurrency, second.incremental, second.timeoutMS], [["src/calc.ts:8-8"], 1, false, 90000]);
    assert.deepEqual([r.seen("mutation").mutate, r.seen("mutation").incremental], [["src/calc.ts:7-9"], true]);
    assert.match(r.stdout, /位点 3：杀死 2、存活 1、无覆盖 0、未跑 0；分数 67%；复核 2（超时转杀死 1、存活 1、仍超时 0）\n/);
    const { recheck, summary, sites } = r.json;
    assert.deepEqual({ ...recheck, seconds: typeof recheck.seconds }, { total: 2, killed: 1, survived: 1, timedOut: 0, notRun: 0, seconds: "number" });
    assert.equal(summary.timedOut, 0);
    assert.deepEqual(sites.map((s) => [s.mutant, s.verdict, s.reason]), [["true", "killed", null], ["n > 1", "killed", "recheck"], ["n < 1", "survived", "recheck"]]);
    assert.equal(typeof r.json.resources.timing.recheckSeconds, "number");
    assert.match(r.stdout, /\| 存活（recheck） \|/);
    assert.equal(git(f.dir, "status --porcelain"), "M src/calc.ts");
  } finally { f.cleanup(); }
});

test.skipIf(skip)("--no-recheck 只起一轮：超时留在杀死里，抬头写其中超时，recheck 为 null", () => {
  const f = setup([FIRST, SECOND]);
  try {
    const r = f.run("--no-recheck");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.calls, 1);
    assert.match(r.stdout, /杀死 3（其中超时 2）、存活 0、无覆盖 0、未跑 0；分数 100%\n/);
    assert.equal(r.json.recheck, null);
    assert.equal(r.json.summary.timedOut, 2);
  } finally { f.cleanup(); }
});

test.skipIf(skip)("没有超时不起第二轮", () => {
  const f = setup([NO_TIMEOUT, SECOND]);
  try {
    const r = f.run();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.calls, 1);
    assert.equal(r.json.recheck, null);
    assert.doesNotMatch(r.stdout, /复核/);
  } finally { f.cleanup(); }
});

test.skipIf(skip)("第二轮失败：第一轮裁定不动，全部记未复核，引擎说明写复核未完成，退出码仍是 0，缺省时限 60 秒", () => {
  const f = setup([FIRST]);
  try {
    const r = f.run();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.calls, 2);
    assert.equal(r.seen("recheck").timeoutMS, 60000);
    assert.match(r.stdout, /杀死 3（其中超时 2）、存活 0、无覆盖 0、未跑 0；分数 100%；复核 2（超时转杀死 0、存活 0、仍超时 0、未复核 2）\n/);
    assert.deepEqual({ ...r.json.recheck, seconds: 0 }, { total: 2, killed: 0, survived: 0, timedOut: 0, notRun: 2, seconds: 0 });
    assert.ok(r.json.engine.notes.some((n) => n.startsWith("复核未完成：第二轮 Stryker 退出 1 且没有报告")), r.json.engine.notes.join("\n"));
    assert.deepEqual(r.json.sites.filter((s) => s.reason === "timeout").length, 2);
  } finally { f.cleanup(); }
});
