// Stryker 引擎的适配层：找依赖、认运行器、选引擎；范围变 mutate 条目与配置、起进程；读报告、映射回位点模型。
// 核心层 core.mjs 与适配器 adapter-typescript.mjs 不知道引擎；mutation.mjs 只在这里拿引擎的决定。
import { existsSync, readFileSync, readdirSync, createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { unitDigests } from "./core.mjs";
import { analyze } from "./adapter-typescript.mjs";

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

/** 范围变 mutate 条目：点名文件整份写路径；改动文件每个改动段写 `路径:起-止`。输入是 changedLines 的 Map 与可变异的文件列表。 */
export function mutateEntries(changed, pinned, files) {
  const entries = [];
  for (const path of files) {
    if (pinned.includes(path)) { entries.push(path); continue; }
    for (const [a, b] of changed.get(path) ?? []) entries.push(`${path}:${a}-${b}`);
  }
  return entries;
}

/** 本仓库在系统临时目录下的工作目录：配置、报告、日志、增量文件都放这里，不进项目。 */
export const workDir = (root) => join(tmpdir(), "pqw-mutation", createHash("sha256").update(root).digest("hex").slice(0, 16) + "-stryker");

/** Stryker 配置。并行度启动时定下；--timeout 给了就映射到 timeoutMS；增量按 incremental 参数（null 不开）。 */
export function strykerConfig({ entries, configFile, concurrency, reportPath, incremental = null, timeoutMs = null, tempDirName = ".stryker-tmp" }) {
  return {
    testRunner: "vitest",
    vitest: { ...(configFile ? { configFile } : {}), related: false },
    coverageAnalysis: "perTest",
    mutate: entries,
    tempDirName,
    cleanTempDir: true,
    concurrency,
    ...(timeoutMs === null ? {} : { timeoutMS: timeoutMs }),
    ...(incremental ? { incremental: true, incrementalFile: incremental.file, force: incremental.force } : { incremental: false }),
    reporters: ["json", "progress-append-only"],
    jsonReporter: { fileName: reportPath },
    thresholds: { high: 80, low: 60, break: null },
  };
}

const PROGRESS_RE = /^Mutation testing \d+%/;
const REUSED_RE = /(\d+) of (\d+) mutant result\(s\) are reused/;

/**
 * 在项目根起 Stryker：`node <core bin> run <配置>`，可包一层 nice。全部输出进日志文件，进度行另交 onProgress。
 * 返回 { status, signal, seconds, reused, tail }；reused 从日志的增量摘要行取，没有为 null；tail 是日志末 20 行。
 * 返回的 kill() 给调用方转发信号。
 */
export function runStryker({ root, coreBin, configPath, nice = null, logPath, onProgress = () => {} }) {
  const args = ["node", coreBin, "run", configPath];
  const cmd = nice === null ? args : ["nice", "-n", String(nice), ...args];
  const t0 = Date.now();
  const lines = [];
  const child = spawn(cmd[0], cmd.slice(1), { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
  const log = createWriteStream(logPath, { flags: "a" });
  let rest = "";
  const onData = (chunk) => {
    log.write(chunk);
    rest += chunk.toString();
    const parts = rest.split("\n"); rest = parts.pop();
    for (const raw of parts) { const line = raw.replace(/\x1b\[[0-9;]*m/g, ""); lines.push(line); if (PROGRESS_RE.test(line)) onProgress(line); }
  };
  child.stdout.on("data", onData); child.stderr.on("data", onData);
  log.on("error", () => {});
  // 日志流关完才算结束：调用方拿到结果就可能删目录，流还没打开就会在那之后报 ENOENT。
  const done = new Promise((resolve) => child.on("close", (status, signal) => {
    if (rest) lines.push(rest.replace(/\x1b\[[0-9;]*m/g, ""));
    const reused = lines.map((l) => REUSED_RE.exec(l)).find(Boolean);
    log.end(() => resolve({ status, signal, seconds: Math.round((Date.now() - t0) / 100) / 10, reused: reused ? Number(reused[1]) : null, tail: lines.slice(-20).join("\n") }));
  }));
  return { done, kill: (sig = "SIGTERM") => child.kill(sig) };
}

/** `.stryker-tmp` 有没有被项目忽略；没被忽略时提醒，跑完会删，被杀时会留下。 */
export function tempDirIgnored(root, tempDirName = ".stryker-tmp") {
  const r = spawnSync("git", ["check-ignore", "-q", tempDirName], { cwd: root, stdio: "ignore" });
  return r.status === 0;
}

/** 读 JSON 报告；文件不在返回 null。 */
export const readReport = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);

/** Stryker 状态到四类裁定；reason 与内建引擎的写法一致（超时记 timeout）。 */
const STATUS = {
  Killed: ["killed", null], Timeout: ["killed", "timeout"], Survived: ["survived", null], NoCoverage: ["uncovered", null],
  RuntimeError: ["notRun", "runtime error"], CompileError: ["notRun", "compile error"], Ignored: ["notRun", "ignored"], Pending: ["notRun", "pending"],
};
/** 变异器名到类别：去掉 Operator、Expression、Literal、Declaration、Statement 后缀，小写。 */
export const categoryOf = (mutatorName) => mutatorName.replace(/(Operator|Expression|Literal|Declaration|Statement|Chaining)$/, "").toLowerCase();

/** 1 起的行列到字节偏移。 */
function offsetOf(text, { line, column }) {
  let pos = 0;
  for (let i = 1; i < line; i++) { const nl = text.indexOf("\n", pos); if (nl < 0) return text.length; pos = nl + 1; }
  return pos + column - 1;
}

/** 行所在的最小有名单元；都不在就是 <module>。 */
const unitAt = (units, line) => units.filter((u) => u.name !== "<module>" && u.startLine <= line && line <= u.endLine).sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0] ?? units.find((u) => u.name === "<module>");

/** 一个变异体变一个位点：单元按行找，原文按位置切，状态按表映射。 */
function mutantSite(path, entry, m, pinned) {
  const line = m.location.start.line;
  const unit = unitAt(entry.units, line);
  const start = offsetOf(entry.text, m.location.start), end = offsetOf(entry.text, m.location.end);
  const [verdict, reason] = STATUS[m.status] ?? ["notRun", m.status];
  const original = entry.text.slice(start, end);
  const category = categoryOf(m.mutatorName);
  return { id: `${path}:${unit.name}:${start - unit.startByte}:${category}:${m.replacement}`, file: path, unit: unit.name, digest: entry.digests?.get(unit.name) ?? null, line, anchorLine: line, start, end, original: original.length > 40 ? original.slice(0, 37) + "…" : original, mutant: m.replacement, category, pinned, verdict, reason, runs: m.testsCompleted ?? 0, seconds: m.duration === undefined ? null : Math.round(m.duration) / 1000, strykerId: m.id };
}

/** 一个文件：点名的全收；否则只收落在改动段里的变异体，没有变异体的段记成未覆盖段。 */
function fileMutants(path, entry, mutants, ranges, isPinned) {
  if (isPinned) return { sites: mutants.map((m) => mutantSite(path, entry, m, true)), unmutated: [] };
  const sites = [];
  const hit = new Set();
  for (const m of mutants) {
    const i = ranges.findIndex(([a, b]) => a <= m.location.start.line && m.location.start.line <= b);
    if (i < 0) continue;
    hit.add(i);
    sites.push(mutantSite(path, entry, m, false));
  }
  const unitName = (line) => { const u = unitAt(entry.units, line); return !u || u.name === "<module>" ? null : u.name; };
  const unmutated = ranges.filter((_, i) => !hit.has(i)).map(([a, b]) => ({ file: path, lines: [a, b], unit: unitName(a), reason: "引擎没有在这段生成变异体" }));
  return { sites, unmutated };
}

/**
 * 报告映射成位点模型：files 是 path → { text, units, digests }，ranges 是 changedLines 的 Map，pinned 是点名的文件。
 * 返回 { sites, unmutated }，位点按文件与位置排序，字段与内建引擎一致，另带 strykerId。
 */
export function mapReport({ report, files, ranges, pinned = [] }) {
  const sites = [];
  const unmutated = [];
  for (const [path, entry] of files) {
    const r = fileMutants(path, entry, report?.files?.[path]?.mutants ?? [], ranges.get(path) ?? [], pinned.includes(path));
    sites.push(...r.sites);
    unmutated.push(...r.unmutated);
  }
  sites.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
  return { sites, unmutated };
}

/** 映射要用的文件表：path → { text, units, digests }；单元由现有适配器按行找。 */
export function fileEntries(root, ts, files) {
  return new Map(files.map((path) => { const text = readFileSync(join(root, path), "utf8"); const { units } = analyze(ts, path, text); return [path, { text, units, digests: unitDigests(text, units) }]; }));
}
