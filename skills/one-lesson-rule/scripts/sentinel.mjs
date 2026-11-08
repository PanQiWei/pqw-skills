#!/usr/bin/env node
// 哨兵子代理取事实的工具：读 plan 的进度总览、处置记录、文档维护表与工作树事实，写一份增量汇报（提交、改动统计、新交回件、文档结构与陈旧、信号），然后睡或退出。不调用模型。
// 文档陈旧信号：进度行 head 不是 HEAD、处置断号、汇报件早于最近提交、plan 结构不合模板（经 spec-and-plan 的 check-plan）、维护表「最近更新」落后而最近提交改了该文档。
// 退出 0 正常；1 读不到 plan 或写不了汇报；2 用法错误。
//
// 用法：
//   sentinel.mjs --plan <plan.md> [--out <目录>] [--interval 45m] [--subagent-check 30m] [--once] [--cycles N] [--session <id>] [--run <id>]
//   --once      只醒一次就退出（宿主有原生定时时用：宿主每次到点调一次）
//   --interval  没有 --once 时的循环间隔，默认 45m；支持 s、m、h
//   --cycles    循环几次后退出，默认无限；测试用
//   --out       汇报目录，默认 <系统临时目录>/pqw-skills/<会话>/<一程>/sentinel
//   --session   会话标识，默认取 CLAUDE_CODE_SESSION_ID、CODEX_COMPANION_SESSION_ID、PQW_SESSION，再不然 unknown
//   --run       一程标识，默认 plan 所在目录名

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execSync, spawnSync } from "node:child_process";

const USAGE = "用法：sentinel.mjs --plan <plan.md> [--out <目录>] [--interval 45m] [--subagent-check 30m] [--once] [--cycles N] [--session <id>] [--run <id>]";

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
const session = opts.session ?? process.env.CLAUDE_CODE_SESSION_ID ?? process.env.CODEX_COMPANION_SESSION_ID ?? process.env.PQW_SESSION ?? "unknown";
const run = opts.run ?? basename(dirname(planPath));
const outDir = resolve(opts.out ?? join(tmpdir(), "pqw-skills", session, run, "sentinel"));
const statePath = join(outDir, "state.json");
/** 守结构的脚本归 spec-and-plan；技能各自装成目录，所以按相对路径找它。测试可用 PQW_CHECK_PLAN 指到别处。 */
const resolveCheckPlan = () => process.env.PQW_CHECK_PLAN ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "spec-and-plan", "scripts", "check-plan.mjs");
const checkPlanPath = resolveCheckPlan();

const sh = (cmd, cwd) => {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, NO_COLOR: "1", GIT_PAGER: "cat" } }).trim();
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
 * 文档陈旧信号：进度行 head 不是 HEAD；处置断号；汇报件早于最近提交；plan 结构不合模板；
 * 维护表某行「最近更新」早于进度行更新时刻而该文档在最近提交里被改过。每条带证据。
 */
const staleSignals = ({ planText, plan, head, repo, runDir, structure }) => {
  const facts = progressFacts(plan.progress);
  const gap = disposalGap(planText);
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
  if (prev && prev.current === plan.current && commits !== "") signals.push("可能兜圈：有提交但「当前」行没变");
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
    "哨兵按 one-lesson-rule 对照 spec 与 plan 判五问：进度有没有偏离 spec 与 plan；是不是在局部兜圈；上下文有没有腐化的迹象；每个在跑的子代理是否健康；给人看的文档有没有过期（信号里以「文档陈旧」开头的）。写回看记录，给主代理发不超过十行的消息；主代理把处置写进 plan 的进度总览。",
    "",
  ].join("\n");

  mkdirSync(outDir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const file = join(outDir, `${stamp}.md`);
  try {
    writeFileSync(file, report);
    writeFileSync(join(outDir, "latest.md"), report);
    writeFileSync(statePath, JSON.stringify({ at: now.toISOString(), head, dirty, current: plan.current, n, dispositions, noDispositionStreak }, null, 2));
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
