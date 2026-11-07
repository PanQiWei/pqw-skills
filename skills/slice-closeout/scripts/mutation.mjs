#!/usr/bin/env node
// 差分变异：只打改动行所在单元的位点，带时间预算，「没跑测试」自动复跑，四类裁定，还原有保证。模型见 ../metrics-model.md。
// 用法：mutation.mjs --test "<测试命令>" [--repo <目录>] [--base <ref>] [--target <分支>] [--lcov <路径>] [--ts <typescript 目录>]
//       [--json <输出路径>] [--format table|json] [--plan-only] [--budget 20m] [--timeout <时长>] [--workers N] [--no-tests-pattern <正则>] [--history <上次 JSON>] [--scope <前缀,前缀>]
// 退出 0 正常（预算用尽也是 0）；1 基线不通过或有文件还原失败；2 用法错误或未提供 typescript；130 被中断。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { parseArgs, resolveBase, changedLines, parseLcov, lookupFile, nestedUnits, ownLines, unitDigests, score, sh } from "./lib/core.mjs";
import { loadTypescript, analyze, sites as findSites, SOURCE_RE, DECLARATION_RE } from "./lib/adapter-typescript.mjs";

const USAGE = "用法：mutation.mjs --test \"<测试命令>\" [--repo <目录>] [--base <ref>] [--target <分支>] [--lcov <路径>] [--ts <typescript 目录>] [--json <输出路径>] [--format table|json] [--plan-only] [--budget 20m] [--timeout <时长>] [--workers N] [--no-tests-pattern <正则>] [--history <上次 JSON>] [--scope <前缀,前缀>]";
const SPEC = { test: "value", repo: "value", base: "value", target: "value", lcov: "value", ts: "value", json: "value", format: "value", "plan-only": "flag", budget: "value", timeout: "value", workers: "value", "no-tests-pattern": "value", history: "value", scope: "value" };
const { opts, error } = parseArgs(process.argv.slice(2), SPEC);
if (error) { console.error(error); console.error(USAGE); process.exit(2); }
if (opts.help) { console.log(USAGE); process.exit(0); }
if (!opts.test) { console.error("未提供：测试命令（--test）"); console.error(USAGE); process.exit(2); }

const duration = (s, fallback) => { if (!s) return fallback; const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(s); if (!m) { console.error(`时长格式错误：${s}`); process.exit(2); } return Number(m[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000 })[m[2] ?? "s"]; };
const TEST_FILE_RE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

const repo = resolve(opts.repo ?? process.cwd());
let root; try { root = sh(repo, ["rev-parse", "--show-toplevel"]); } catch { console.error(`不是 Git 仓库：${repo}`); process.exit(2); }
let ts; try { ts = loadTypescript(opts.ts, root); } catch (e) { console.error(e.message); process.exit(2); }
let base; try { base = resolveBase(root, opts.base, opts.target); } catch (e) { console.error(e.message); process.exit(2); }
const head = sh(root, ["rev-parse", "HEAD"]);
const report = opts.lcov ? parseLcov(readFileSync(resolve(root, opts.lcov), "utf8")) : null;
const history = opts.history ? JSON.parse(readFileSync(resolve(opts.history), "utf8")) : null;
const scope = opts.scope ? opts.scope.split(",").map((s) => s.trim()).filter(Boolean) : null;
const budgetMs = duration(opts.budget, 20 * 60000);
const noTests = new RegExp(opts["no-tests-pattern"] ?? "No test files found|no tests? (ran|found)|0 (tests?|passed)|ran 0 tests", "i");
const workers = Number(opts.workers ?? Math.max(1, cpus().length - 1));

// ---- 位点收集
const files = new Map(); // path → { text, units, digests }
const all = [];
for (const [path, ranges] of changedLines(root, base)) {
  if (scope && !scope.some((p) => path.startsWith(p))) continue;
  if (!SOURCE_RE.test(path) || DECLARATION_RE.test(path) || TEST_FILE_RE.test(path) || /(^|\/)node_modules\//.test(path) || !existsSync(join(root, path))) continue;
  const text = readFileSync(join(root, path), "utf8");
  const { sourceFile, units } = analyze(ts, path, text);
  const digests = unitDigests(text, units);
  files.set(path, { text, units, digests });
  for (const unit of units) {
    if (unit.name === "<module>") continue;
    const own = new Set(ownLines(unit, nestedUnits(unit, units)));
    const changed = ranges.some(([a, b]) => a >= 1 && [...own].some((l) => l >= a && l <= b));
    if (!changed) continue;
    for (const s of findSites(ts, sourceFile, text, unit, own)) all.push({ file: path, unit: unit.name, digest: digests.get(unit.name), ...s, verdict: "planned", reason: null, attempts: 0, seconds: null });
  }
}
all.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
all.forEach((s, i) => { s.id = `${s.file}:${s.line}:${s.start}:${s.category}`; });

// ---- 选择：覆盖门控与历史沿用
const covered = (s) => { if (!report) return true; const rec = lookupFile(report, s.file); if (!rec) return false; const hit = (l) => (rec.lines.get(l)?.[0] ?? 0) > 0 || (rec.branches.get(l)?.[0] ?? 0) > 0; return hit(s.line) || hit(s.anchorLine); };
const prior = new Map((history?.sites ?? []).map((s) => [s.id, s]));
for (const s of all) {
  if (!covered(s)) { s.verdict = "uncovered"; continue; }
  const p = prior.get(s.id);
  if (p && p.digest === s.digest && p.verdict === "killed") { s.verdict = "killed"; s.reason = "carried"; }
}

// ---- 运行
const result = { kind: "pqw-mutation", generatedAt: new Date().toISOString(), base, head, testCommand: opts.test, planOnly: Boolean(opts["plan-only"]), baseline: { passed: null, seconds: null }, budget: { limitMs: budgetMs, exceeded: false }, sites: all, summary: {}, survivors: [] };
// 从测试运行器里启动本工具时，NODE_TEST_CONTEXT 会让嵌套的 node --test 变成子报告进程，退出码失真，所以剥掉。
const env = { ...process.env, PQW_TEST_WORKERS: String(workers), VITEST_MAX_WORKERS: process.env.VITEST_MAX_WORKERS ?? String(workers) };
delete env.NODE_TEST_CONTEXT;
let child = null;
const runTests = (timeoutMs) => new Promise((resolveRun) => {
  const t0 = Date.now(); let output = ""; let timedOut = false;
  child = spawn(opts.test, { cwd: root, shell: true, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  child.stdout.on("data", (d) => { output += d; }); child.stderr.on("data", (d) => { output += d; });
  const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, "SIGKILL"); } catch {} }, timeoutMs);
  child.on("close", (code) => { clearTimeout(timer); child = null; resolveRun({ code, timedOut, output, seconds: (Date.now() - t0) / 1000 }); });
});

let applied = null; // { path, original }
const restore = () => { if (!applied) return true; writeFileSync(join(root, applied.path), applied.original); const ok = readFileSync(join(root, applied.path), "utf8") === applied.original; applied = null; return ok; };
const interrupted = (code) => { if (child) { try { process.kill(-child.pid, "SIGKILL"); } catch {} } restore(); process.exit(code); };
process.on("SIGINT", () => interrupted(130));
process.on("SIGTERM", () => interrupted(143));

let restoreFailed = false;
if (!opts["plan-only"]) {
  const t0 = Date.now();
  const b = await runTests(duration(opts.timeout, 10 * 60000));
  result.baseline = { passed: b.code === 0 && !b.timedOut, seconds: b.seconds, tail: b.output.split("\n").slice(-5).join("\n") };
  if (!result.baseline.passed) for (const s of all) if (s.verdict === "planned") { s.verdict = "notRun"; s.reason = "baselineFailed"; }
  const timeoutMs = duration(opts.timeout, Math.max(10000, b.seconds * 5000));
  for (const s of all) {
    if (s.verdict !== "planned") continue;
    if (Date.now() - t0 > budgetMs) { result.budget.exceeded = true; s.verdict = "notRun"; s.reason = "budget"; continue; }
    const original = files.get(s.file).text;
    const mutated = original.slice(0, s.start) + s.mutant + original.slice(s.end);
    let verdict = null; let reason = null; let seconds = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      s.attempts = attempt;
      applied = { path: s.file, original };
      writeFileSync(join(root, s.file), mutated);
      let r;
      try { r = await runTests(timeoutMs); } finally { if (!restore()) restoreFailed = true; }
      seconds += r.seconds;
      if (r.timedOut || r.code !== 0) { verdict = "killed"; reason = r.timedOut ? "timeout" : null; break; }
      if (noTests.test(r.output)) { verdict = "notRun"; reason = "noTests"; continue; }
      verdict = "survived"; break;
    }
    s.verdict = verdict; s.reason = reason; s.seconds = Math.round(seconds * 100) / 100;
  }
}

// ---- 汇总与输出
const count = (v) => all.filter((s) => s.verdict === v).length;
result.summary = { total: all.length, killed: count("killed"), survived: count("survived"), uncovered: count("uncovered"), notRun: count("notRun"), planned: count("planned"), score: score(all) };
result.survivors = all.filter((s) => s.verdict === "survived").map((s) => ({ file: s.file, unit: s.unit, line: s.line, original: s.original, mutant: s.mutant, category: s.category, suggestion: s.mutant === "" ? `删去 ${s.original} 后测试仍过：补一条能区分有无 ${s.original} 的断言，或说明它为什么等价` : `${s.original} 换成 ${s.mutant} 后测试仍过：补一条在边界上能区分两者的断言，或说明它为什么等价` }));
if (opts.json) writeFileSync(resolve(opts.json), JSON.stringify(result, null, 2) + "\n");
if (opts.format === "json") console.log(JSON.stringify(result, null, 2));
else {
  const sm = result.summary;
  console.log(`差分变异：基线 ${base.slice(0, 12)} 到工作树；位点 ${sm.total}${result.planOnly ? "（只列）" : `：杀死 ${sm.killed}、存活 ${sm.survived}、无覆盖 ${sm.uncovered}、未跑 ${sm.notRun}；分数 ${sm.score === null ? "无" : (sm.score * 100).toFixed(0) + "%"}`}${result.budget.exceeded ? "；预算用尽" : ""}`);
  if (!result.planOnly && !result.baseline.passed) console.log(`基线不通过：\n${result.baseline.tail}`);
  console.log("| 文件 | 单元 | 行 | 原文 | 替换 | 类别 | 裁定 |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const s of all) console.log(`| ${s.file} | ${s.unit} | ${s.line} | \`${s.original}\` | \`${s.mutant === "" ? "（删去）" : s.mutant}\` | ${s.category} | ${({ planned: "待跑", killed: "杀死", survived: "存活", uncovered: "无覆盖", notRun: "未跑" })[s.verdict]}${s.reason ? `（${s.reason}）` : ""} |`);
  if (all.length === 0) console.log("| | 没有位点 | | | | | |");
  if (result.survivors.length) { console.log("\n存活的位点："); for (const s of result.survivors) console.log(`- ${s.file}:${s.line} ${s.unit}：${s.suggestion}`); }
}
process.exit(restoreFailed || (!result.planOnly && !result.baseline.passed) ? 1 : 0);
