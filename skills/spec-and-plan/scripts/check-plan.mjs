#!/usr/bin/env node
// 核 plan、spec 与交接信息包的骨架是否仍合模板。逻辑在 lib/check-plan.mjs，本文件只是命令面。
// 退出 0 结构合模板；1 有缺陷（逐条列出「文件:行 缺陷」）；2 用法错误或读不到文件。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkFiles, formatDefects } from "./lib/check-plan.mjs";

const USAGE = `用法：check-plan.mjs [--plan <plan.md>] [--spec <spec.md>] [--handoff <交接信息包>] [--format json]
按 spec-and-plan 的模板核结构：必需的节在且顺序对、进度行与处置行格式对、切片表与文档维护表表头齐、维护表「最近更新」是 UTC 时刻或「未…」、每个切片有「交付这片的意义」「开工包」「收口」、处置编号连续；spec 的「责任分级」有重点行，重点行带反引号括起的路径。缺陷按「文件:行 缺什么」列出，整节缺失取不到行时只写文件。
交接信息包按 single-session-dev-flow 的模板核：抬头、九节在且顺序对、边界带责任分级表、起点一行带提交号、四问四条都有答案。
只核结构，不核内容好坏。

  --plan <路径>       交付计划；与 --handoff 至少给一个
  --spec <路径>       实施规格；给了就一起核
  --handoff <路径>    交接信息包；交付会话开工时单给它核
  --format json       打印 { ok, defects: [{ file, line, message }] }

退出 0 合模板；1 有缺陷；2 用法错误或读不到文件。`;

/** 解析参数；错误时打印原因与用法并退出 2。 */
function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0); }
    if (!["--plan", "--spec", "--handoff", "--format"].includes(a)) usageError(`未知参数 ${a}`);
    if (i + 1 >= argv.length) usageError(`${a} 缺少值`);
    opts[a.slice(2)] = argv[++i];
  }
  if (!opts.plan && !opts.handoff) usageError("未提供：--plan 或 --handoff");
  return opts;
}
const usageError = (message) => { console.error(message); console.error(USAGE); process.exit(2); };
const opts = parseArgs(process.argv.slice(2));

/** 读文件；读不到退出 2。 */
const read = (p) => { try { return readFileSync(resolve(p), "utf8"); } catch { console.error(`读不到：${p}`); process.exit(2); } };

const defects = checkFiles(opts, read);
if (opts.format === "json") console.log(JSON.stringify({ ok: defects.length === 0, defects }, null, 2));
else console.log(formatDefects(defects));
process.exit(defects.length === 0 ? 0 : 1);
