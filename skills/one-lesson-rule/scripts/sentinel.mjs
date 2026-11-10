#!/usr/bin/env node
// 哨兵子代理取事实的工具：读 plan 的进度总览、处置记录、文档维护表、圈外发现，spec 的责任分级与工作树事实，写一份增量汇报（提交、改动统计、新交回件、圈外发现条数、文档结构与陈旧、信号），然后睡或退出。不调用模型。
// 圈外改动信号只给事实：上次唤醒以来的提交与未提交改动里，落在责任分级所有路径之外的文件。它可能是圈外做功，也可能是本程改动带出、还没补进 spec 的消费者，由哨兵与主代理判。
// 文档陈旧信号：进度行 head 不是 HEAD、汇报件早于最近提交、plan 结构不合模板（经 spec-and-plan 的 check-plan；它核不了时才由本脚本自己报处置断号）、维护表「最近更新」落后而最近提交改了该文档。
// 退出 0 正常；1 读不到 plan 或写不了汇报；2 用法错误。
//
// 用法：
//   sentinel.mjs --plan <plan.md> [--spec <spec.md>] [--out <目录>] [--interval 45m] [--subagent-check 30m] [--once] [--cycles N] [--session <id>] [--run <id>]
//   --spec      取责任分级的 spec，默认 plan 同目录的 spec.md
//   --once      只醒一次就退出（宿主有原生定时时用：宿主每次到点调一次）
//   --interval  没有 --once 时的循环间隔，默认 45m；支持 s、m、h
//   --cycles    循环几次后退出，默认无限；测试用
//   --out       汇报目录，默认 <系统临时目录>/pqw-skills/<会话>/<一程>/sentinel
//   --session   会话标识，默认取 CLAUDE_CODE_SESSION_ID、CODEX_COMPANION_SESSION_ID、PQW_SESSION，再不然 unknown
//   --run       一程标识，默认 plan 所在目录名

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, realpathSync } from "node:fs";
import { join, dirname, basename, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execSync, spawnSync } from "node:child_process";

const USAGE = "用法：sentinel.mjs --plan <plan.md> [--spec <spec.md>] [--out <目录>] [--interval 45m] [--subagent-check 30m] [--once] [--cycles N] [--session <id>] [--run <id>]";

const parseArgs = (argv) => {
  const opts = { interval: "45m", subagentCheck: "30m", once: false, cycles: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(`${a} 缺少值`);
      return argv[++i];
    };
    switch (a) {
      case "--help": case "-h": console.log(USAGE); process.exit(0);
      case "--plan": opts.plan = next(); break;
      case "--spec": opts.spec = next(); break;
      case "--out": opts.out = next(); break;
      case "--interval": opts.interval = next(); break;
      case "--subagent-check": opts.subagentCheck = next(); break;
      case "--once": opts.once = true; break;
      case "--cycles": opts.cycles = Number(next()); break;
      case "--session": opts.session = next(); break;
      case "--run": opts.run = next(); break;
      default: throw new Error(`未知参数 ${a}`);
    }
  }
  if (!opts.plan) throw new Error("缺少 --plan");
  return opts;
};

const parseDuration = (s) => {
  const m = /^(\d+)(s|m|h)$/.exec(s);
  if (!m) throw new Error(`时长格式应为 <数字>s|m|h，收到 ${s}`);
  return Number(m[1]) * { s: 1000, m: 60_000, h: 3_600_000 }[m[2]];
};

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
  opts.intervalMs = parseDuration(opts.interval);
  opts.subagentCheckMs = parseDuration(opts.subagentCheck);
} catch (e) {
  console.error(e.message);
  console.error(USAGE);
  process.exit(2);
}

const planPath = resolve(opts.plan);
const specPath = resolve(opts.spec ?? join(dirname(planPath), "spec.md"));
const session = opts.session ?? process.env.CLAUDE_CODE_SESSION_ID ?? process.env.CODEX_COMPANION_SESSION_ID ?? process.env.PQW_SESSION ?? "unknown";
const run = opts.run ?? basename(dirname(planPath));
const outDir = resolve(opts.out ?? join(tmpdir(), "pqw-skills", session, run, "sentinel"));
const statePath = join(outDir, "state.json");
/** 守结构的脚本归 spec-and-plan；技能各自装成目录，所以按相对路径找它。测试可用 PQW_CHECK_PLAN 指到别处。 */
const resolveCheckPlan = () => process.env.PQW_CHECK_PLAN ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "spec-and-plan", "scripts", "check-plan.mjs");
const checkPlanPath = resolveCheckPlan();

const gitEnv = { ...process.env, NO_COLOR: "1", GIT_PAGER: "cat" };
const sh = (cmd, cwd) => {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: gitEnv }).trim();
  } catch {
    return null;
  }
};

/** 目录里（递归）修改时刻晚于 sinceMs 的文件，相对路径；跳过 skip 目录。 */
const listChanged = (dir, sinceMs, skip) => {
  const out = [];
  const walk = (d) => {
    let names;
    try { names = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      const p = join(d, e.name);
      if (p === skip) continue;
      if (e.isDirectory()) walk(p);
      else { try { if (statSync(p).mtimeMs > sinceMs) out.push(p.slice(dir.length + 1)); } catch {} }
    }
  };
  walk(dir);
  return out.sort();
};

const parsePlan = (text) => {
  const progress = text.match(/^进度：.*$/m)?.[0] ?? "（没有进度行）";
  const current = text.match(/^当前：.*$/m)?.[0] ?? "（没有当前行）";
  const tables = [];
  let cur = null;
  for (const line of text.split("\n")) {
    if (/^\|/.test(line)) {
      if (!cur) cur = [];
      cur.push(line.split("|").slice(1, -1).map((c) => c.trim()));
    } else if (cur) {
      tables.push(cur);
      cur = null;
    }
  }
  if (cur) tables.push(cur);
  const milestones = [...text.matchAll(/^\s*- \[( |x)\] (.*)$/gm)].map((m) => ({ done: m[1] === "x", text: m[2] }));
  return { progress, current, slices: tableRows(tables, "切片"), agents: tableRows(tables, "子代理"), docs: tableRows(tables, "文档"), milestones };
};

/** 首格为 name 的那张表的数据行（去掉表头与分隔行）；没有这张表返回空。 */
const tableRows = (tables, name) => {
  const table = tables.find((t) => t[0]?.[0] === name);
  return table ? table.slice(2) : [];
};

/** 进度行里写的 head（至少 7 位十六进制才算）与更新时刻。 */
const progressFacts = (progress) => ({
  head: /head ([0-9a-f]{7,40})\b/.exec(progress)?.[1] ?? null,
  updatedMs: Date.parse(/更新 (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z)/.exec(progress)?.[1] ?? ""),
});

/** 处置编号按出现顺序是否连续；返回第一处断号的说明，没有返回 null。 */
const disposalGap = (text) => {
  let expected = 1;
  for (const m of text.matchAll(/^处置 (\d+)（/gm)) {
    if (Number(m[1]) !== expected) return `应为 ${expected} 却是 ${m[1]}`;
    expected = Number(m[1]) + 1;
  }
  return null;
};

/** 一个二级节的正文行（不含标题）；没有这一节返回 null。 */
const sectionLines = (text, title) => {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l === `## ${title}` || l.startsWith(`## ${title}（`));
  if (at < 0) return null;
  const end = lines.findIndex((l, i) => i > at && l.startsWith("## "));
  return lines.slice(at + 1, end < 0 ? undefined : end);
};
const cellsOf = (line) => (line.trim().startsWith("|") ? line.trim().slice(1, -1).split("|").map((c) => c.trim()) : null);
const LEVELS = ["重点", "次要", "连带"];

/** spec 的责任分级：{ paths } 是三级各行反引号里的路径（去掉开头的 ./ 与结尾的 /）；取不到时 { missing } 写原因。 */
const scopeOf = (path) => {
  let text;
  try { text = readFileSync(path, "utf8"); } catch { return { missing: `读不到 spec ${path}` }; }
  const lines = sectionLines(text, "责任分级");
  if (!lines) return { missing: `${path} 没有「## 责任分级」节` };
  const paths = lines.map(cellsOf).filter((c) => LEVELS.includes(c?.[0]))
    .flatMap((c) => [...(c[1] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1].replace(/^\.\//, "").replace(/\/+$/, "")));
  return paths.length ? { paths } : { missing: `${path} 的责任分级表里没有反引号括起的路径` };
};

/** 文件落在某条路径上：就是它，或在它这个目录下。pkg/a 不盖 pkg/ab/。 */
const covered = (file, paths) => paths.some((p) => file === p || file.startsWith(`${p}/`));

/** 仓库里的相对路径；不在仓库里或文件不存在返回 null。 */
const repoRelative = (repo, path) => { try { return relative(repo, realpathSync(path)); } catch { return null; } };

/** 上次唤醒以来改过的文件：按上次的 head 取提交里的文件，加上未提交与未跟踪的改动；第一次唤醒没有上次的 head，只看未提交改动。Git 忽略的不算。 */
const changedFiles = (repo, prevHead) => {
  const quiet = "-c core.quotepath=off";
  const committed = prevHead ? sh(`git ${quiet} log --name-only --format= ${prevHead}..HEAD`, repo) ?? "" : "";
  const worktree = [sh(`git ${quiet} diff --name-only HEAD`, repo), sh(`git ${quiet} ls-files --others --exclude-standard`, repo)].join("\n");
  const files = [...new Set(`${committed}\n${worktree}`.split("\n").filter(Boolean))];
  if (files.length === 0) return [];
  const ignored = new Set((spawnSync("git", ["check-ignore", "--no-index", "--stdin"], { cwd: repo, input: files.join("\n"), encoding: "utf8", env: gitEnv }).stdout ?? "").split("\n").filter(Boolean));
  return files.filter((f) => !ignored.has(f)).sort();
};

/** plan 与 spec 自身在仓库里的相对路径：改它们是记账，不算圈外改动，也不算兜圈。 */
const ownFiles = (repo) => new Set([repoRelative(repo, planPath), repoRelative(repo, specPath)]);

/** 进度标记：当前行、勾上的里程碑数、各切片状态。任何一样动了，这一轮就算有进展。 */
const progressKey = (plan) => JSON.stringify([plan.current, plan.milestones.filter((m) => m.done).length, plan.slices.map((r) => r[3] ?? "")]);

/** 圈外改动或责任分级缺失的信号：改过的文件里落在责任分级所有路径之外的，plan 与 spec 自身除外，最多列 10 个。 */
const scopeSignals = (repo, prevHead) => {
  const scope = scopeOf(specPath);
  if (scope.missing) return [`责任分级缺失：${scope.missing}`];
  if (!repo) return [];
  const own = ownFiles(repo);
  const outside = changedFiles(repo, prevHead).filter((f) => !own.has(f) && !covered(f, scope.paths));
  if (outside.length === 0) return [];
  return [`圈外改动：${outside.slice(0, 10).join("、")}${outside.length > 10 ? `（共 ${outside.length} 个，只列前 10 个）` : ""}`];
};

/** plan「圈外发现」表：条数与挡住验收的条数（第五格写了编号：不是空，也不以「无」开头，「无（已绕）」不算挡住）；没有这一节返回 null。 */
const findingsOf = (planText) => {
  const lines = sectionLines(planText, "圈外发现");
  if (!lines) return null;
  const rows = lines.map(cellsOf).filter((c) => c && c[0] !== "时刻" && !/^-+$/.test(c[0]));
  return { total: rows.length, blocking: rows.filter((c) => (c[4] ?? "") !== "" && !c[4].startsWith("无")).length };
};

/** 汇报「进度」节的圈外发现一行：与上一轮比差，上一轮没记就不比。 */
const findingsLine = (findings, prev) => {
  if (!findings) return "圈外发现：plan 没有「## 圈外发现」节";
  const delta = (now, before) => (typeof before === "number" ? `（比上一轮 ${now - before >= 0 ? "+" : ""}${now - before}）` : "");
  return `圈外发现：${findings.total} 条${delta(findings.total, prev?.findings?.total)}，挡住验收 ${findings.blocking} 条${delta(findings.blocking, prev?.findings?.blocking)}`;
};

/** 汇报件：本程目录或其 artifacts 子目录下的 report.html，取第一个存在的。 */
const reportFile = (runDir) => [join(runDir, "report.html"), join(runDir, "artifacts", "report.html")].find((p) => existsSync(p)) ?? null;

/** 跑 spec-and-plan 的 check-plan：返回 { note, defects }；不是模板格式的 plan 或找不到脚本时 defects 为 null。 */
const checkStructure = (planText) => {
  if (!/^# .+ 交付计划（revision \d+）/m.test(planText)) return { note: "未核结构：plan 抬头不是模板格式", defects: null };
  if (!existsSync(checkPlanPath)) return { note: `未核结构：找不到 check-plan（${checkPlanPath}）`, defects: null };
  const r = spawnSync(process.execPath, [checkPlanPath, "--plan", planPath, "--format", "json"], { encoding: "utf8" });
  try {
    const parsed = JSON.parse(r.stdout);
    return { note: parsed.ok ? "check-plan：结构合模板" : `check-plan：${parsed.defects.length} 处缺陷`, defects: parsed.defects };
  } catch {
    return { note: `未核结构：check-plan 没有给出结果（退出 ${r.status}）`, defects: null };
  }
};

/** 进度行写的 head 与当前 HEAD 不是同一个提交（互不为前缀）。 */
const headSignal = (facts, head) => (facts.head && head && !facts.head.startsWith(head) && !head.startsWith(facts.head) ? [`文档陈旧：plan 进度行写的 head ${facts.head} 不是当前 HEAD ${head}`] : []);

/** 汇报件早于最近一次提交。 */
const reportSignal = (repo, runDir) => {
  const lastCommitMs = repo ? Number(sh("git log -1 --format=%ct", repo) ?? 0) * 1000 : 0;
  const report = reportFile(runDir);
  if (!report || !lastCommitMs) return [];
  const builtMs = statSync(report).mtimeMs;
  return builtMs < lastCommitMs ? [`文档陈旧：汇报件 ${basename(report)} 生成于 ${new Date(builtMs).toISOString()}，早于最近提交 ${new Date(lastCommitMs).toISOString()}`] : [];
};

/** 维护表的一行：第一格反引号里的路径、最后一格的时刻；时刻早于进度行更新且最近提交改了它就是一条信号，否则 null。 */
const staleDocRow = (row, facts, head, touched) => {
  const path = /`([^`]+)`/.exec(row[0] ?? "")?.[1];
  const updatedMs = Date.parse(row[5] ?? "");
  if (!path || Number.isNaN(updatedMs) || updatedMs >= facts.updatedMs || !touched(path)) return null;
  return `文档陈旧：维护表里 ${path} 最近更新 ${row[5]} 早于进度行更新 ${new Date(facts.updatedMs).toISOString()}，而最近提交 ${head} 改了它`;
};

/** 维护表里落后且被最近提交改过的文档，每份一条信号。 */
const docsTableSignals = (plan, facts, head, repo) => {
  if (Number.isNaN(facts.updatedMs)) return [];
  const changed = repo ? (sh("git show --name-only --format= HEAD", repo) ?? "").split("\n").filter(Boolean) : [];
  const touched = (path) => changed.some((f) => f === path || f.endsWith(`/${path}`) || path.endsWith(`/${f}`));
  return plan.docs.map((row) => staleDocRow(row, facts, head, touched)).filter(Boolean);
};

/**
 * 文档陈旧信号：进度行 head 不是 HEAD；汇报件早于最近提交；plan 结构不合模板；
 * 维护表某行「最近更新」早于进度行更新时刻而该文档在最近提交里被改过。每条带证据。
 * 处置断号是结构缺陷之一，check-plan 给出结果时由它报，没核结构时才自己报，不重复。
 */
const staleSignals = ({ planText, plan, head, repo, runDir, structure }) => {
  const facts = progressFacts(plan.progress);
  const gap = structure.defects === null ? disposalGap(planText) : null;
  return [
    ...headSignal(facts, head),
    ...(gap ? [`文档陈旧：处置编号断号，${gap}`] : []),
    ...reportSignal(repo, runDir),
    ...(structure.defects?.length ? [`文档陈旧：plan 结构不合模板，${structure.defects.length} 处缺陷（${structure.defects[0].message}）`] : []),
    ...docsTableSignals(plan, facts, head, repo),
  ];
};

/** 汇报的「文档」节：结构核对结果（最多列 10 条缺陷）与维护表行数。 */
const docsSection = (structure, plan) => [
  "## 文档",
  "",
  `- ${structure.note}`,
  ...(structure.defects ?? []).slice(0, 10).map((d) => `  - ${d.file}${d.line === null ? "" : `:${d.line}`} ${d.message}`),
  `- 维护表：${plan.docs.length} 行`,
  "",
];

const wake = (n) => {
  const now = new Date();
  let planText;
  try {
    planText = readFileSync(planPath, "utf8");
  } catch (e) {
    console.error(`读不到 plan：${planPath}：${e.message}`);
    process.exit(1);
  }
  const plan = parsePlan(planText);
  const prev = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;
  const repo = sh("git rev-parse --show-toplevel", dirname(planPath));
  const head = repo ? sh("git rev-parse --short HEAD", repo) : null;
  const since = prev?.at ?? null;
  // 上次唤醒以来的提交：按上次记下的 head 算，精确到提交；第一次只列最近 5 条。
  const commits = repo ? sh(prev?.head ? `git log --oneline ${prev.head}..HEAD` : "git log --oneline -5", repo) ?? "" : "";
  const dirty = repo ? (sh("git status --porcelain", repo) ?? "").split("\n").filter(Boolean).length : 0;
  const diffStat = repo ? sh("git diff --stat | tail -1", repo) ?? "" : "";
  const commitLines = commits.split("\n").filter(Boolean);
  // 处置记录：主代理每次回看后在 plan 写一行「处置 n（时刻）：…」。连续两轮没有新处置，就是主代理没有回应哨兵。
  const dispositions = (planText.match(/^处置 \d+/gm) ?? []).length;
  const noDispositionStreak = prev && prev.dispositions === dispositions ? (prev.noDispositionStreak ?? 0) + 1 : 0;
  // 交回件：汇报目录的上一级（本程目录）里上次唤醒以来新出现或改过的文件，不含哨兵自己的目录。
  const newArtifacts = since ? listChanged(dirname(outDir), new Date(since).getTime(), outDir) : [];

  const signals = [];
  if (prev && commits === "" && prev.head === head && prev.dirty === dirty) signals.push("停滞：上次唤醒以来没有新提交，工作树也没变");
  // 兜圈：一直在改却没有进展。一轮有提交而进度标记没动只算「停住的一轮」；连续两轮停住、两轮又改了同一批文件才报。
  // 顺着推进的连续提交（先实现再补用例、再重构）会动进度标记，同一文件连改几次不算。
  const progress = progressKey(plan);
  const stuck = Boolean(prev && repo && commits !== "" && prev.progress === progress);
  const touched = stuck ? changedFiles(repo, prev.head).filter((f) => !ownFiles(repo).has(f)) : [];
  const repeated = (prev?.stuckFiles ?? []).filter((f) => touched.includes(f));
  if (repeated.length) signals.push(`可能兜圈：连续两轮有提交，进度标记（当前行、勾上的里程碑数、切片状态）都没动，两轮都改了 ${repeated.slice(0, 10).join("、")}${repeated.length > 10 ? `（共 ${repeated.length} 个，只列前 10 个）` : ""}`);
  if (noDispositionStreak >= 2) signals.push(`主代理连续 ${noDispositionStreak} 轮没有写处置：plan 里仍是 ${dispositions} 条`);
  const running = plan.agents.filter((r) => /进行中|第 \d+\/\d+ 轮/.test(r[5] ?? ""));
  for (const r of running) {
    const start = Date.parse(r[4] ?? "");
    if (Number.isNaN(start)) continue;
    const elapsed = now.getTime() - start;
    if (elapsed >= opts.subagentCheckMs) {
      const k = Math.floor(elapsed / opts.subagentCheckMs);
      signals.push(`子代理「${r[0]}」已运行 ${Math.round(elapsed / 60000)} 分钟，到了第 ${k} 个健康检查点`);
    }
  }
  const doneM = plan.milestones.filter((m) => m.done).length;
  const structure = checkStructure(planText);
  const findings = findingsOf(planText);
  signals.push(...scopeSignals(repo, prev?.head));
  signals.push(...staleSignals({ planText, plan, head, repo, runDir: dirname(outDir), structure }));

  const report = [
    `# 哨兵汇报 ${now.toISOString()}`,
    "",
    `- 第 ${n} 次唤醒；上次 ${since ?? "无"}`,
    `- plan：${planPath}`,
    `- head：${head ?? "不在 Git 仓库"}；未提交改动 ${dirty} 处${diffStat ? `；${diffStat}` : ""}`,
    "",
    "## 进度",
    "",
    plan.progress,
    plan.current,
    "",
    "| 切片 | 状态 |",
    "| --- | --- |",
    ...plan.slices.map((r) => `| ${r[0]} | ${r[3] ?? ""} |`),
    "",
    `里程碑：${doneM}/${plan.milestones.length} 已勾`,
    findingsLine(findings, prev),
    "",
    "## 增量摘要",
    "",
    `- 上次唤醒以来提交 ${commitLines.length} 条${commitLines.length > 20 ? "（只列前 20 条）" : ""}`,
    commitLines.length ? "```\n" + commitLines.slice(0, 20).join("\n") + "\n```" : "无",
    `- 未提交改动：${diffStat || "无"}`,
    `- 新出现的交回件：${newArtifacts.length ? "" : "无"}`,
    ...newArtifacts.slice(0, 20).map((p) => `  - ${p}`),
    `- 处置记录：${dispositions} 条${noDispositionStreak ? `；连续 ${noDispositionStreak} 轮没有新增` : ""}`,
    "",
    "## 在跑的子代理",
    "",
    running.length ? running.map((r) => `- ${r[0]}：${r[1]}，开始 ${r[4]}`).join("\n") : "无",
    "",
    ...docsSection(structure, plan),
    "## 信号",
    "",
    signals.length ? signals.map((s) => `- ${s}`).join("\n") : "- 无异常信号",
    "",
    "## 读这份汇报的要做的",
    "",
    "哨兵按 one-lesson-rule 对照 spec 与 plan 判六问：进度有没有偏离 spec 与 plan（含在圈外做功：信号里的「圈外改动」只是事实，可能是圈外做功，也可能是本程改动带出、还没补进 spec 责任分级的消费者，提醒里两种都写，由主代理判；「责任分级缺失」时判不了圈外，消息里写明）；是不是在局部兜圈（一直在改却没有进展才算，看「可能兜圈」信号、收口轮数与反复红；先实现再补用例这类顺着推进的连续提交不算；是就提醒按入口技能「写代码的四条」第四条找本质解）；上下文有没有腐化的迹象；每个在跑的子代理是否健康；实现是不是比本质复杂（切片用时超预算、同一切片提交过多、读数变差、改动面过大，是就提醒回到本质解与必要的建模；从已经定义的不变式出发，主代理或子代理在给不变式排除的状态写处理、分支或用例，是就提醒这是过度设计、违背对不变式的守护，按「写代码的四条」第三条删掉）；给人看的文档有没有过期（信号里以「文档陈旧」开头的）。写回看记录，给主代理发不超过十行的消息；主代理把处置写进 plan 的进度总览。",
    "",
  ].join("\n");

  mkdirSync(outDir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const file = join(outDir, `${stamp}.md`);
  try {
    writeFileSync(file, report);
    writeFileSync(join(outDir, "latest.md"), report);
    writeFileSync(statePath, JSON.stringify({ at: now.toISOString(), head, dirty, current: plan.current, progress, stuckFiles: stuck ? touched : null, n, dispositions, noDispositionStreak, findings }, null, 2));
  } catch (e) {
    console.error(`写不了汇报：${outDir}：${e.message}`);
    process.exit(1);
  }
  console.log(`哨兵唤醒 ${n}：${file}`);
  console.log(plan.progress);
  for (const s of signals) console.log(`信号：${s}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const prevN = existsSync(statePath) ? (JSON.parse(readFileSync(statePath, "utf8")).n ?? 0) : 0;
let n = prevN;
if (opts.once) {
  wake(++n);
} else {
  let cycles = 0;
  // 循环模式：先睡再醒。宿主没有原生定时时用，到点只写文件，不调模型。
  while (cycles < opts.cycles) {
    await sleep(opts.intervalMs);
    wake(++n);
    cycles++;
  }
}
