#!/usr/bin/env node
// 核派发简报的结构与评审措辞。逻辑在 lib/check-brief.mjs，本文件只是命令面。
// 退出 0 合格；1 有缺陷（逐条列「文件:行 缺陷」）；2 用法错误或读不到文件。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkBrief } from "./lib/check-brief.mjs";

const USAGE = `用法：check-brief.mjs <简报.md>...
按 delegate-brief 的简报模板核：九节齐、目标节有角色行；角色是评审者或验收者时要有「允许的动作」「不做的事」两小节；对抗式的要求（找新反例、挑战设计、自写探针、找问题）只能写在「不做的事」里。
项目自带的评审角色也用这份简报，只换执行者。
退出 0 合格；1 有缺陷；2 用法错误或读不到文件。`;

const files = process.argv.slice(2);
if (files.includes("--help") || files.includes("-h")) { console.log(USAGE); process.exit(0); }
if (files.length === 0) { console.error("未提供简报文件"); console.error(USAGE); process.exit(2); }
let total = 0;
for (const f of files) {
  let text;
  try { text = readFileSync(resolve(f), "utf8"); } catch { console.error(`读不到：${f}`); process.exit(2); }
  const defects = checkBrief(text);
  total += defects.length;
  for (const d of defects) console.log(`${f}${d.line === null ? "" : `:${d.line}`} ${d.message}`);
}
console.log(total === 0 ? "check-brief：合格" : `check-brief：${total} 处缺陷`);
process.exit(total === 0 ? 0 : 1);
