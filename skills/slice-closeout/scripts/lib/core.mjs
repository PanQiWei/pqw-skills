// 与语言无关的核心，按 ../metrics-model.md：改动行、lcov、覆盖率、CRAP、单元摘要、裁定。
// 定义取自 unclebob/crapper 与 unclebob/mutator（0BSD）。不认识任何语言的语法。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, resolve, isAbsolute, sep } from "node:path";

/** 会把 git 指到别的仓库或索引的环境变量；读数只认 cwd 所在的仓库，所以剥掉。 */
const GIT_REDIRECTS = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_COMMON_DIR", "GIT_NAMESPACE"];
export function gitEnv(base = process.env) {
  const env = { ...base, GIT_PAGER: "cat", NO_COLOR: "1" };
  for (const k of GIT_REDIRECTS) delete env[k];
  return env;
}

/** git 输出的缓冲上限：1 GiB。Node 缺省 1 MB，大仓库的 diff 一超就 ENOBUFS。 */
export const GIT_MAX_BUFFER = 1024 * 1024 * 1024;

export const sh = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: GIT_MAX_BUFFER, stdio: ["ignore", "pipe", "pipe"], env: gitEnv() }).trimEnd();

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

/** 覆盖率报告目录（任意层级的 coverage/）：未跟踪且没被 .gitignore 忽略时是生成物，不算改动文件；已跟踪的照常算，那是源码。 */
const COVERAGE_DIR_RE = /(^|\/)coverage\//;

/**
 * 范围前缀与成员前缀合成交给 git 的前缀：null 表示不限；空数组表示两者不相交，什么路径都不在范围里。
 * 范围是字符串前缀（`inScope` 用 startsWith），成员前缀是目录，取交时成员目录以「前缀/」参与。
 */
export function diffPrefixes(scope, projectPrefix = "") {
  if (!projectPrefix) return scope;
  const dir = `${projectPrefix}/`;
  if (!scope) return [dir];
  return [...new Set(scope.flatMap((s) => (s.startsWith(dir) ? [s] : dir.startsWith(s) ? [dir] : [])))];
}

/** 前缀变 git 的 pathspec：通配符按字面（反斜杠转义），末尾补 `*`，git 的默认 pathspec 里 `*` 跨目录，所以与 startsWith 同义。 */
const pathspecOf = (prefix) => `${prefix.replace(/[\\*?[]/g, "\\$&")}*`;

/** 前缀数组变 `-- <pathspec…>`；null 不限，没有参数；前缀以 : 开头会被 git 当成 pathspec 魔法，这时放弃收窄（读出之后仍按前缀过滤）。 */
const pathspecArgs = (prefixes) => (prefixes && !prefixes.some((p) => p.startsWith(":")) ? ["--", ...prefixes.map(pathspecOf)] : ["--"]);

/** 未跟踪文件（遵守 .gitignore）的相对路径。 */
const untrackedFiles = (cwd, prefixes) => sh(cwd, ["ls-files", "--others", "--exclude-standard", ...pathspecArgs(prefixes)]).split("\n").filter((f) => f && !COVERAGE_DIR_RE.test(f));

/**
 * 基线到工作树的改动行：path → 新一侧的闭区间列表。纯删除记删除点前后两行 [max(1,c), c+1]，c 是新一侧删除点前一行。
 * prefixes 是路径前缀数组，只对这些前缀取 diff 与未跟踪文件，null 不限，空数组什么都不取；任意层级的 coverage/ 目录不算。
 */
export function changedLines(cwd, base, prefixes = null) {
  const result = new Map();
  if (prefixes?.length === 0) return result;
  const out = sh(cwd, ["diff", "-U0", "--no-color", "--no-ext-diff", base, ...pathspecArgs(prefixes)]);
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
  for (const file of untrackedFiles(cwd, prefixes)) {
    if (result.has(file)) continue;
    let count = 0;
    try { count = readFileSync(join(cwd, file), "utf8").split("\n").length; } catch { continue; }
    result.set(file, [[1, Math.max(1, count)]]);
  }
  return result;
}

/** 基线到工作树改动的文件名（含删除与未跟踪），只取名字不取 diff；prefixes 与 coverage/ 的规则同 changedLines。 */
export function changedPaths(cwd, base, prefixes = null) {
  if (prefixes?.length === 0) return [];
  const names = sh(cwd, ["diff", "--name-only", "--no-color", "--no-ext-diff", base, ...pathspecArgs(prefixes)]).split("\n").filter(Boolean);
  return [...new Set([...names, ...untrackedFiles(cwd, prefixes)])];
}

export const touches = (ranges, start, end) => ranges.some(([a, b]) => a <= end && b >= start);

/** 测试文件：tests、test、__tests__、spec 目录下的，或 .test、.spec 后缀的，含类型测试的 .test-d、.spec-d。读数不度量，变异不打。 */
export const TEST_FILE_RE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)(-d)?\.[cm]?[jt]sx?$/;

/** 测试文件摘要：工作树里（含未跟踪的）测试文件的路径与内容按路径排序后取 sha256。测试一变，变异的历史就不能沿用。 */
export function testFilesDigest(root) {
  const tracked = sh(root, ["ls-files"]).split("\n");
  const untracked = sh(root, ["ls-files", "--others", "--exclude-standard"]).split("\n");
  const paths = [...new Set([...tracked, ...untracked])].filter((p) => p && TEST_FILE_RE.test(p) && existsSync(join(root, p))).sort();
  const hash = createHash("sha256");
  for (const p of paths) hash.update(p).update("\0").update(readFileSync(join(root, p))).update("\0");
  return hash.digest("hex");
}

/** 逐个分支的命中（键「行,块,分支」）按行聚合成 (covered, total)。 */
function branchesByLine(hits) {
  const out = new Map();
  for (const [key, hit] of hits) { const ln = Number(key.split(",")[0]); const [c, t] = out.get(ln) ?? [0, 0]; out.set(ln, [c + hit, t + 1]); }
  return out;
}

const emptyRecord = () => ({ lines: new Map(), branches: new Map(), branchHits: new Map() });

/** lcov：file → { lines: Map<line,[covered,total]>, branches: Map<line,[covered,total]>, branchHits: Map<「行,块,分支」,0|1> }。branchHits 留着给合并取并。 */
export function parseLcov(text) {
  const files = new Map();
  let current = null; let name = null;
  const close = () => { current.branches = branchesByLine(current.branchHits); files.set(name, current); current = null; };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("SF:")) { name = normalizePath(line.slice(3)); current = emptyRecord(); continue; }
    if (!current) continue;
    let m;
    if ((m = /^DA:(\d+),(\d+)/.exec(line))) current.lines.set(Number(m[1]), [Number(m[2]) > 0 ? 1 : 0, 1]);
    else if ((m = /^BRDA:(\d+),([^,]*),([^,]*),(-|\d+)$/.exec(line))) current.branchHits.set(`${m[1]},${m[2]},${m[3]}`, m[4] !== "-" && Number(m[4]) > 0 ? 1 : 0);
    else if (line === "end_of_record") close();
  }
  if (current && name) close();
  return files;
}

/** 几份报告合成一份：同一文件取各行、各分支命中的并。 */
export function mergeLcov(reports) {
  const merged = new Map();
  for (const report of reports) for (const [name, rec] of report) {
    const into = merged.get(name) ?? emptyRecord();
    for (const [ln, [c]] of rec.lines) into.lines.set(ln, [Math.max(c, into.lines.get(ln)?.[0] ?? 0), 1]);
    for (const [key, hit] of rec.branchHits) into.branchHits.set(key, Math.max(hit, into.branchHits.get(key) ?? 0));
    into.branches = branchesByLine(into.branchHits);
    merged.set(name, into);
  }
  return merged;
}

/** 绝对路径在 Git 根里时的根相对路径（/ 分隔），不在根里为 null。 */
const insideRoot = (root, p) => { const r = relative(root, p); return r === ".." || r.startsWith(`..${sep}`) || isAbsolute(r) ? null : r.split(sep).join("/"); };

/**
 * 报告里一个源码路径换成 Git 根相对路径：相对路径从报告所在目录起找，那里没有这个文件就逐级往上找到 Git 根为止
 * （测试运行器常把报告写在项目下的 coverage/ 里，路径却相对项目目录）；绝对路径直接换。找不到或在根外原样留着，按后缀匹配。
 */
function locateSource(root, dir, name) {
  if (isAbsolute(name)) return insideRoot(root, name) ?? name;
  for (let d = dir; ; d = dirname(d)) {
    if (existsSync(join(d, name))) return insideRoot(root, join(d, name)) ?? name;
    if (d === root || dirname(d) === d) return name;
  }
}

/** 读几份覆盖率报告（Git 根相对或绝对路径）：各自的源码路径按 locateSource 换算后合并。返回 { report, mtimeMs }，mtimeMs 取最早的一份。 */
export function loadLcov(root, paths) {
  const files = paths.map((p) => resolve(root, p));
  const located = files.flatMap((f) => [...parseLcov(readFileSync(f, "utf8"))].map(([name, rec]) => new Map([[locateSource(root, dirname(f), name), rec]])));
  return { report: mergeLcov(located), mtimeMs: Math.min(...files.map((f) => statSync(f).mtimeMs)) };
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
