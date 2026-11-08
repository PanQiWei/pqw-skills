// Stryker 引擎的适配层：找依赖、认运行器、选引擎（本文件），之后是范围变配置、起进程、读报告、映射回位点模型。
// 核心层 core.mjs 与适配器 adapter-typescript.mjs 不知道引擎；mutation.mjs 只在这里拿引擎的决定。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 脚本目录自带的 node_modules：`scripts/package.json` 钉版本，`npm ci --prefix <脚本目录>` 装到这里。 */
export const SCRIPTS_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const SCRIPTS_MODULES = join(SCRIPTS_DIR, "node_modules");
const CORE = "@stryker-mutator/core";
const RUNNER = "@stryker-mutator/vitest-runner";
const RUNNER_CONFIG_RE = /^(vitest|vite)\.config\.[cm]?[jt]s$/;

const readPackage = (dir) => { const p = join(dir, "package.json"); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null; };

/** 一个 node_modules 目录里核心与 vitest runner 都在才算找到。 */
function probe(modulesDir, from) {
  const core = readPackage(join(modulesDir, CORE));
  const runner = readPackage(join(modulesDir, RUNNER));
  if (!core || !runner) return null;
  const vitest = readPackage(join(modulesDir, "vitest"));
  return { modulesDir, from, version: core.version, runnerVersion: runner.version, vitestVersion: vitest?.version ?? null, coreBin: join(modulesDir, CORE, core.bin?.stryker ?? "bin/stryker.js") };
}

/** 查找的目录，按顺序：项目根 node_modules → 指定目录（--stryker-modules 或 PQW_STRYKER_MODULES）→ 脚本目录。 */
export const searchDirs = ({ root, modulesDir = null, env = process.env, scriptsModules = SCRIPTS_MODULES }) =>
  [[join(root, "node_modules"), "项目 node_modules"], [modulesDir ?? env.PQW_STRYKER_MODULES ?? null, "指定目录"], [scriptsModules, "脚本目录 node_modules"]].filter(([dir]) => dir).map(([dir, from]) => [resolve(dir), from]);

/** 按 searchDirs 的顺序找，返回第一处找到的 { modulesDir, from, version, runnerVersion, vitestVersion, coreBin }；都没有返回 null。 */
export function resolveStryker(where) {
  for (const [dir, from] of searchDirs(where)) { const found = probe(dir, from); if (found) return found; }
  return null;
}

/** 认项目的测试运行器：根下有 vitest.config.* 或 vite.config.*，或 package.json 声明 vitest，算 vitest；别的都不认。 */
export function detectRunner(root) {
  const config = existsSync(root) ? readdirSync(root).filter((n) => RUNNER_CONFIG_RE.test(n)).sort()[0] : undefined;
  if (config) return { name: "vitest", configFile: config, evidence: `项目根有 ${config}` };
  const pkg = readPackage(root);
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if ("vitest" in deps) return { name: "vitest", configFile: null, evidence: "package.json 声明了 vitest" };
  return null;
}

export const ENGINES = ["auto", "stryker", "builtin"];
const installHint = (dirs) => `找不到 Stryker：${dirs.map(([d]) => d).join("、")} 里都没有 ${CORE} 与 ${RUNNER}；装法 npm ci --prefix ${SCRIPTS_DIR}，或用 --stryker-modules / PQW_STRYKER_MODULES 指向装好的 node_modules`;

/** 选引擎。返回 { name, version, runner, reason, modules, configFile }：前四项进抬头与 JSON；modules 与 configFile 给 Stryker 路径用。
 *  显式要 Stryker 而找不到依赖或认不出运行器时抛错（.code = "unavailable"），命令面退出 2。 */
export function chooseEngine({ engine = "auto", root, modulesDir = null, env = process.env, scriptsModules = SCRIPTS_MODULES }) {
  if (!ENGINES.includes(engine)) { const e = new Error(`--engine 只接受 ${ENGINES.join("、")}：${engine}`); e.code = "usage"; throw e; }
  const builtin = (reason) => ({ name: "builtin", version: null, runner: null, reason, modules: null, configFile: null });
  if (engine === "builtin") return builtin("显式 --engine builtin");
  const where = { root, modulesDir, env, scriptsModules };
  const runner = detectRunner(root);
  const found = runner ? resolveStryker(where) : null;
  const missing = !runner ? "项目没有 vitest 配置也没有声明 vitest，Stryker 引擎只支持 vitest" : !found ? installHint(searchDirs(where)) : null;
  if (missing && engine === "stryker") { const e = new Error(missing); e.code = "unavailable"; throw e; }
  if (missing) return builtin(missing);
  return { name: "stryker", version: found.version, runner: runner.name, reason: `${runner.evidence}；Stryker ${found.version} 取自${found.from}`, modules: found, configFile: runner.configFile };
}
