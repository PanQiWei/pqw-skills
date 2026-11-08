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
    assert.equal(found.status, 2, found.stdout);
    assert.match(found.stderr, /Stryker 引擎的运行尚未接入/);
  } finally { dispose(dir); }
});
