#!/usr/bin/env node
// 哨兵：按间隔醒来，读 plan 的进度总览与工作树事实，写一份增量汇报给主代理，然后睡。不调用模型。
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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

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

const sh = (cmd, cwd) => {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, NO_COLOR: "1", GIT_PAGER: "cat" } }).trim();
  } catch {
    return null;
  }
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
  const sliceTable = tables.find((t) => t[0]?.[0] === "切片");
  const agentTable = tables.find((t) => t[0]?.[0] === "子代理");
  const rows = (t) => (t ? t.slice(2) : []);
  const milestones = [...text.matchAll(/^\s*- \[( |x)\] (.*)$/gm)].map((m) => ({ done: m[1] === "x", text: m[2] }));
  return { progress, current, slices: rows(sliceTable), agents: rows(agentTable), milestones };
};

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
  const commits = repo ? sh(since ? `git log --oneline --since="${since}"` : "git log --oneline -5", repo) ?? "" : "";
  const dirty = repo ? (sh("git status --porcelain", repo) ?? "").split("\n").filter(Boolean).length : 0;
  const diffStat = repo ? sh("git diff --stat | tail -1", repo) ?? "" : "";

  const signals = [];
  if (prev && commits === "" && prev.head === head && prev.dirty === dirty) signals.push("停滞：上次唤醒以来没有新提交，工作树也没变");
  if (prev && prev.current === plan.current && commits !== "") signals.push("可能兜圈：有提交但「当前」行没变");
  const running = plan.agents.filter((r) => /进行中/.test(r[5] ?? ""));
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
    "## 上次唤醒以来的提交",
    "",
    commits ? "```\n" + commits + "\n```" : "无",
    "",
    "## 在跑的子代理",
    "",
    running.length ? running.map((r) => `- ${r[0]}：${r[1]}，开始 ${r[4]}`).join("\n") : "无",
    "",
    "## 信号",
    "",
    signals.length ? signals.map((s) => `- ${s}`).join("\n") : "- 无异常信号",
    "",
    "## 主代理要做的",
    "",
    "按 one-lesson-rule 回看：进度有没有偏离 spec 与 plan；是不是在局部兜圈；上下文有没有腐化；每个在跑的子代理是否健康。回看结论写进 plan 的进度总览或汇报件。",
    "",
  ].join("\n");

  mkdirSync(outDir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const file = join(outDir, `${stamp}.md`);
  try {
    writeFileSync(file, report);
    writeFileSync(join(outDir, "latest.md"), report);
    writeFileSync(statePath, JSON.stringify({ at: now.toISOString(), head, dirty, current: plan.current, n }, null, 2));
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
