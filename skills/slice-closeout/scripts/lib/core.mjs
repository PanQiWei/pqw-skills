// 与语言无关的核心，按 ../metrics-model.md：改动行、lcov、覆盖率、CRAP、单元摘要、裁定。
// 定义取自 unclebob/crapper 与 unclebob/mutator（0BSD）。不认识任何语言的语法。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** 会把 git 指到别的仓库或索引的环境变量；读数只认 cwd 所在的仓库，所以剥掉。 */
const GIT_REDIRECTS = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_COMMON_DIR", "GIT_NAMESPACE"];
export function gitEnv(base = process.env) {
  const env = { ...base, GIT_PAGER: "cat", NO_COLOR: "1" };
  for (const k of GIT_REDIRECTS) delete env[k];
  return env;
}

export const sh = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: gitEnv() }).trimEnd();

/**
 * 基线：显式 ref 取它与 HEAD 的合并点，ref 是 HEAD 的祖先时合并点就是它自己，不是（基线分支前进过）就退到共同祖先；
 * 没给 ref 取与目标分支的合并点，目标分支缺省依次试 main、master。
 * 返回 { base, baseGiven }：baseGiven 是显式 ref 解析出的提交，没给为 null；它与 base 不同就是改用了合并点。
 */
export function resolveBase(cwd, given, target) {
  if (given) {
    const baseGiven = sh(cwd, ["rev-parse", given]);
    return { base: sh(cwd, ["merge-base", "HEAD", baseGiven]), baseGiven };
  }
  const candidates = target ? [target] : ["main", "master"];
  for (const t of candidates) {
    try { sh(cwd, ["rev-parse", "--verify", "--quiet", t]); } catch { continue; }
    return { base: sh(cwd, ["merge-base", "HEAD", t]), baseGiven: null };
  }
  throw new Error(`找不到目标分支（试过 ${candidates.join("、")}），用 --base 或 --target 指定`);
}

/** 抬头里的基线：改用了合并点就写明给的是哪个。 */
export const baseLabel = (base, baseGiven) => base.slice(0, 12) + (baseGiven && baseGiven !== base ? `（给的 ${baseGiven.slice(0, 12)} 不是 HEAD 的祖先，改用合并点）` : "");

/** 基线到工作树的改动行：path → 新一侧的闭区间列表。纯删除记删除点前后两行 [max(1,c), c+1]，c 是新一侧删除点前一行。 */
export function changedLines(cwd, base) {
  const out = sh(cwd, ["diff", "-U0", "--no-color", "--no-ext-diff", base, "--"]);
  const result = new Map();
  let file = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("+++ ")) { file = line.slice(4).replace(/^b\//, "").trim(); if (file === "/dev/null") file = null; continue; }
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m || !file) continue;
    const start = Number(m[1]); const count = m[2] === undefined ? 1 : Number(m[2]);
    const range = count === 0 ? [Math.max(1, start), Math.max(1, start) + 1] : [start, start + count - 1];
    result.set(file, [...(result.get(file) ?? []), range]);
  }
  // 未跟踪的新文件也是工作树的改动：整份算改动行。
  const untracked = sh(cwd, ["ls-files", "--others", "--exclude-standard"]);
  for (const file of untracked.split("\n").filter(Boolean)) {
    if (result.has(file)) continue;
    let count = 0;
    try { count = readFileSync(join(cwd, file), "utf8").split("\n").length; } catch { continue; }
    result.set(file, [[1, Math.max(1, count)]]);
  }
  return result;
}

export const touches = (ranges, start, end) => ranges.some(([a, b]) => a <= end && b >= start);

/** 测试文件：tests、test、__tests__、spec 目录下的，或 .test、.spec 后缀的。读数不度量，变异不打。 */
export const TEST_FILE_RE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

/** 测试文件摘要：工作树里（含未跟踪的）测试文件的路径与内容按路径排序后取 sha256。测试一变，变异的历史就不能沿用。 */
export function testFilesDigest(root) {
  const tracked = sh(root, ["ls-files"]).split("\n");
  const untracked = sh(root, ["ls-files", "--others", "--exclude-standard"]).split("\n");
  const paths = [...new Set([...tracked, ...untracked])].filter((p) => p && TEST_FILE_RE.test(p) && existsSync(join(root, p))).sort();
  const hash = createHash("sha256");
  for (const p of paths) hash.update(p).update("\0").update(readFileSync(join(root, p))).update("\0");
  return hash.digest("hex");
}

/** lcov：file → { lines: Map<line,[covered,total]>, branches: Map<line,[covered,total]> }。 */
export function parseLcov(text) {
  const files = new Map();
  let current = null; let name = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("SF:")) { name = normalizePath(line.slice(3)); current = { lines: new Map(), branches: new Map() }; continue; }
    if (!current) continue;
    let m;
    if ((m = /^DA:(\d+),(\d+)/.exec(line))) current.lines.set(Number(m[1]), [Number(m[2]) > 0 ? 1 : 0, 1]);
    else if ((m = /^BRDA:(\d+),[^,]*,[^,]*,(-|\d+)$/.exec(line))) {
      const ln = Number(m[1]); const hit = m[2] !== "-" && Number(m[2]) > 0 ? 1 : 0;
      const [c, t] = current.branches.get(ln) ?? [0, 0]; current.branches.set(ln, [c + hit, t + 1]);
    } else if (line === "end_of_record") { files.set(name, current); current = null; }
  }
  if (current && name) files.set(name, current);
  return files;
}

export const normalizePath = (p) => p.replace(/\\/g, "/").replace(/^file:/, "").replace(/^(\.\/)+/, "").replace(/\/{2,}/g, "/");

/**
 * 报告里选一个源码文件的记录（照 crapper 的 _select_key）：全等优先；否则按整段路径后缀匹配，任一方向，
 * 恰一个候选才取；多个候选不猜，记歧义。多包仓库里成员相对的 `src/index.ts` 不能被任何同名文件认领。
 */
export function selectRecord(report, path) {
  const target = normalizePath(path);
  if (report.has(target)) return { record: report.get(target), ambiguous: false };
  const candidates = [...report.keys()].filter((key) => key.endsWith("/" + target) || target.endsWith("/" + key));
  if (candidates.length === 1) return { record: report.get(candidates[0]), ambiguous: false };
  return { record: null, ambiguous: candidates.length > 1 };
}

export const lookupFile = (report, path) => selectRecord(report, path).record;

/** 单元自己的行：扣掉更内层单元。 */
export function ownLines(unit, nested) {
  const lines = [];
  for (let l = unit.startLine; l <= unit.endLine; l++) if (!nested.some((n) => l >= n.startLine && l <= n.endLine)) lines.push(l);
  return lines;
}

export const nestedUnits = (outer, units) => units.filter((o) => o !== outer && o.startLine >= outer.startLine && o.endLine <= outer.endLine && (o.startLine > outer.startLine || o.endLine < outer.endLine));

/**
 * 覆盖率三态：有值；没有报告（「未提供报告」）；报告里没有这个文件或范围内没有记录（「无数据」的两种原因）。
 * 有记录时分支记录优先，没有分支取行记录。返回 { value, reason }，value 为 null 时 reason 说明为什么。
 */
export function coverageOf(report, path, unit, nested) {
  if (!report) return { value: null, reason: "未提供报告" };
  const { record: rec, ambiguous } = selectRecord(report, path);
  if (!rec) return { value: null, reason: ambiguous ? "报告里多个文件匹配" : "报告里没有这个文件" };
  const lines = ownLines(unit, nested);
  const sum = (map) => lines.reduce(([c, t], l) => { const e = map.get(l); return e ? [c + e[0], t + e[1]] : [c, t]; }, [0, 0]);
  const [bc, bt] = sum(rec.branches);
  if (bt > 0) return { value: bc / bt, reason: null };
  const [lc, lt] = sum(rec.lines);
  return lt === 0 ? { value: null, reason: "范围内没有记录" } : { value: lc / lt, reason: null };
}

export const crap = (cc, coverage) => (coverage === null || coverage === undefined ? null : cc * cc * (1 - coverage) ** 3 + cc);

/** 限定名 → 单元摘要。 */
export function unitDigests(text, units) {
  const lines = text.split("\n");
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  const parts = new Map();
  for (const unit of [...units].sort((a, b) => a.startLine - b.startLine)) {
    const own = ownLines(unit, nestedUnits(unit, units)).filter((l) => l <= lines.length).map((l) => lines[l - 1].trimEnd());
    parts.set(unit.name, [...(parts.get(unit.name) ?? []), sha(own.join("\n"))]);
  }
  return new Map([...parts].map(([k, v]) => [k, v.length === 1 ? v[0] : sha(v.join(""))]));
}

export const round = (v, d = 2) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);

/** 变异分数：killed / (killed + survived)，没有已执行的位点为 null。 */
export function score(verdicts) {
  let k = 0, s = 0;
  for (const v of verdicts) { if (v.verdict === "killed") k++; else if (v.verdict === "survived") s++; }
  return k + s === 0 ? null : k / (k + s);
}

/** 通用参数解析：spec = { name: "flag" | "value" }。返回 { opts, error }。 */
export function parseArgs(argv, spec) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { opts: { help: true } };
    if (!a.startsWith("--") || !(a.slice(2) in spec)) return { error: `未知参数 ${a}` };
    const key = a.slice(2);
    if (spec[key] === "flag") { opts[key] = true; continue; }
    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) return { error: `${a} 缺少值` };
    opts[key] = argv[++i];
  }
  return { opts };
}

/** `--scope a,b` 拆成前缀数组；没给返回 null，表示不过滤。 */
export const parseScope = (text) => (text ? text.split(",").map((s) => s.trim()).filter(Boolean) : null);

/** 范围前缀过滤；scope 为 null 表示不过滤。 */
export const inScope = (path, scope) => !scope || scope.some((p) => path.startsWith(p));
