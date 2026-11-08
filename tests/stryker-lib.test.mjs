// 直接打 lib/stryker.mjs：查找目录的顺序、依赖解析、运行器识别、引擎选择。不需要真的 Stryker，用假的 node_modules 目录。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { searchDirs, resolveStryker, detectRunner, chooseEngine, SCRIPTS_MODULES } from "../skills/slice-closeout/scripts/lib/stryker.mjs";

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

test("选引擎：auto 两种结果各带原因；显式 builtin 不看项目；显式 stryker 缺依赖或没 vitest 抛 unavailable；非法值抛 usage", () => {
  const root = tmp(), given = tmp();
  try {
    const noRunner = chooseEngine({ root, env: {}, scriptsModules: NOWHERE });
    assert.equal(noRunner.name, "builtin");
    assert.match(noRunner.reason, /没有 vitest 配置/);
    writeFileSync(join(root, "vitest.config.ts"), "");
    const noDeps = chooseEngine({ root, env: {}, scriptsModules: NOWHERE });
    assert.equal(noDeps.name, "builtin");
    assert.match(noDeps.reason, /找不到 Stryker：.*node_modules.*npm ci --prefix/);
    assert.throws(() => chooseEngine({ engine: "stryker", root, env: {}, scriptsModules: NOWHERE }), (e) => e.code === "unavailable" && /npm ci/.test(e.message));
    fakeModules(given);
    const chosen = chooseEngine({ root, env: { PQW_STRYKER_MODULES: given }, scriptsModules: NOWHERE });
    assert.equal(chosen.name, "stryker");
    assert.equal(chosen.version, "9.9.9");
    assert.equal(chosen.runner, "vitest");
    assert.equal(chosen.configFile, "vitest.config.ts");
    assert.equal(chosen.modules.modulesDir, given);
    assert.match(chosen.reason, /^项目根有 vitest\.config\.ts；Stryker 9\.9\.9 取自指定目录$/);
    const forced = chooseEngine({ engine: "builtin", root, env: { PQW_STRYKER_MODULES: given }, scriptsModules: NOWHERE });
    assert.deepEqual(forced, { name: "builtin", version: null, runner: null, reason: "显式 --engine builtin", modules: null, configFile: null });
    rmSync(join(root, "vitest.config.ts"));
    assert.throws(() => chooseEngine({ engine: "stryker", root, env: { PQW_STRYKER_MODULES: given }, scriptsModules: NOWHERE }), (e) => e.code === "unavailable" && /只支持 vitest/.test(e.message));
    assert.throws(() => chooseEngine({ engine: "jest", root, env: {} }), (e) => e.code === "usage");
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(given, { recursive: true, force: true }); }
});
