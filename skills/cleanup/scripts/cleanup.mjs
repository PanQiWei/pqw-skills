#!/usr/bin/env node
// 清理：缺省只列（--plan），列出来是让人判断还要不要；只有 --apply 才动手。每条独立执行，中断不留半删状态。
// 退出 0 正常；1 有条目删除失败；2 用法错误。
//
// 用法：cleanup.mjs --scope slice|run --prefix <分支或工作树名前缀> [--repo <路径>] [--session <id>] [--run <id>] [--project-tmp <目录>] [--apply]
//   --scope slice   清子代理的工作树与分支（按前缀匹配），保留汇报件与过程材料
//   --scope run     再加系统临时目录下本程子目录，以及 --project-tmp 指定的过程材料目录
//   --prefix        子代理分支与工作树的名字前缀，例如 run-1/ 或 closure-
//   --plan          只列清单，是默认行为的显式写法
//   --apply         真的删。没有它只列清单
//
// 安全规则：主工作树不删；当前分支不删；有未提交改动的工作树不删；没合进当前 HEAD 的分支不删。这些条目列为「跳过」并写原因。

import { existsSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

const USAGE = "用法：cleanup.mjs --scope slice|run --prefix <前缀> [--repo <路径>] [--session <id>] [--run <id>] [--project-tmp <目录>] [--plan|--apply]";
const opts = { apply: false, repo: process.cwd(), run: "run" };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) { console.error(`${a} 缺少值`); console.error(USAGE); process.exit(2); }
    return argv[++i];
  };
  if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0); }
  else if (a === "--scope") opts.scope = next();
  else if (a === "--prefix") opts.prefix = next();
  else if (a === "--repo") opts.repo = next();
  else if (a === "--session") opts.session = next();
  else if (a === "--run") opts.run = next();
  else if (a === "--project-tmp") opts.projectTmp = next();
  else if (a === "--apply") opts.apply = true;
  else if (a === "--plan") opts.apply = false;
  else { console.error(`未知参数 ${a}`); console.error(USAGE); process.exit(2); }
}
if (!["slice", "run"].includes(opts.scope) || !opts.prefix) { console.error(USAGE); process.exit(2); }

const sh = (cmd, cwd = opts.repo) => {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1", GIT_PAGER: "cat" } }).trim();
  } catch (e) {
    return { error: (e.stderr || e.message || "").toString().trim() };
  }
};
const ok = (r) => typeof r === "string";

const root = sh("git rev-parse --show-toplevel");
if (!ok(root)) { console.error(`不是 Git 仓库：${opts.repo}`); process.exit(2); }
const mainWorktree = sh("git worktree list --porcelain").split("\n")[0]?.replace(/^worktree /, "");
const currentBranch = sh("git branch --show-current");
const merged = new Set(sh("git branch --merged HEAD --format='%(refname:short)'").split("\n").filter(Boolean));

const items = [];

// 工作树
const wt = sh("git worktree list --porcelain");
for (const block of wt.split("\n\n")) {
  const path = block.match(/^worktree (.*)$/m)?.[1];
  const branch = block.match(/^branch refs\/heads\/(.*)$/m)?.[1] ?? "";
  if (!path || path === mainWorktree) continue;
  if (!branch.startsWith(opts.prefix) && !path.split("/").pop().startsWith(opts.prefix)) continue;
  const dirty = ok(sh("git status --porcelain", path)) ? sh("git status --porcelain", path).length > 0 : true;
  let skip = null;
  if (dirty) skip = "有未提交改动";
  else if (branch && !merged.has(branch)) skip = "分支没合进当前 HEAD";
  items.push({
    kind: "工作树",
    name: branch ? `${path}（分支 ${branch}）` : path,
    branch,
    skip,
    remove: () => {
      const r = sh(`git worktree remove "${path}"`);
      if (!ok(r) || !branch) return r;
      return sh(`git branch -d "${branch}"`);
    },
  });
}

// 分支（不含仍被工作树占用的，那些随工作树处理）
const occupied = new Set(items.map((i) => i.branch));
for (const b of sh("git branch --format='%(refname:short)'").split("\n").filter(Boolean)) {
  if (!b.startsWith(opts.prefix) || occupied.has(b)) continue;
  let skip = null;
  if (b === currentBranch) skip = "当前分支";
  else if (!merged.has(b)) skip = "没合进当前 HEAD";
  items.push({ kind: "分支", name: b, skip, remove: () => sh(`git branch -d "${b}"`) });
}

// 一程级：系统临时目录子目录与项目过程材料
if (opts.scope === "run") {
  const session = opts.session ?? process.env.CLAUDE_CODE_SESSION_ID ?? process.env.CODEX_COMPANION_SESSION_ID ?? process.env.PQW_SESSION ?? "unknown";
  const tmp = join(tmpdir(), "pqw-skills", session, opts.run);
  items.push({ kind: "临时目录", name: tmp, skip: existsSync(tmp) ? null : "不存在", remove: () => { rmSync(tmp, { recursive: true, force: true }); return ""; } });
  if (opts.projectTmp) {
    const p = resolve(opts.projectTmp);
    const inside = p.startsWith(root + "/");
    items.push({ kind: "过程材料", name: p, skip: !existsSync(p) ? "不存在" : !inside ? "不在仓库内，拒绝" : null, remove: () => { rmSync(p, { recursive: true, force: true }); return ""; } });
  }
}

// 输出清单
console.log(`清理范围：${opts.scope}；前缀：${opts.prefix}；${opts.apply ? "执行" : "只列不删"}`);
console.log("| 类型 | 条目 | 处置 |");
console.log("| --- | --- | --- |");
let failed = 0;
for (const it of items) {
  if (it.skip) { console.log(`| ${it.kind} | ${it.name} | 跳过：${it.skip} |`); continue; }
  if (!opts.apply) { console.log(`| ${it.kind} | ${it.name} | 可删 |`); continue; }
  const r = it.remove();
  if (ok(r)) console.log(`| ${it.kind} | ${it.name} | 已删 |`);
  else { failed++; console.log(`| ${it.kind} | ${it.name} | 删除失败：${r.error} |`); }
}
if (items.length === 0) console.log("| | 没有匹配的条目 | |");
process.exit(failed ? 1 : 0);
