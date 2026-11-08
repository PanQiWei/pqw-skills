#!/usr/bin/env node
// 汇报件生成：把 plan 的进度总览、结构读数与差分变异的 JSON、架构前后图合成一份单文件 HTML。逻辑在 lib/report.mjs，本文件只是命令面。
// 用法：build-report.mjs --plan <plan.md> --out <html> [--title <标题>] [--metrics <json>] [--mutation <json>] [--before <mermaid>] [--after <mermaid>] [--decisions <md>] [--demo <路径>]
// 退出 0 正常；1 输入文件读不到；2 用法错误。
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOptions } from "./lib/args.mjs";
import { parseOverview, renderSlices, renderRemaining, renderArchitecture, renderMetrics, renderDecisions, renderDemo, renderReport } from "./lib/report.mjs";

const USAGE = "用法：build-report.mjs --plan <plan.md> --out <html> [--title <标题>] [--metrics <json>] [--mutation <json>] [--before <mermaid>] [--after <mermaid>] [--decisions <md>] [--demo <路径>]";
const { opts, help, error } = parseOptions(process.argv.slice(2));
if (help) { console.log(USAGE); process.exit(0); }
if (error) { console.error(error); console.error(USAGE); process.exit(2); }
if (!opts.plan || !opts.out) { console.error(USAGE); process.exit(2); }

/** 读输入文件；没给路径返回 null，读不到退出 1。 */
const read = (p, label) => { if (!p) return null; try { return readFileSync(resolve(p), "utf8"); } catch { console.error(`读不到${label}：${p}`); process.exit(1); } };
const json = (p, label) => { const text = read(p, label); return text === null ? null : JSON.parse(text); };

const { progress, current, rows } = parseOverview(read(opts.plan, " plan"));
const { decisions, lead } = renderDecisions(read(opts.decisions, "待决事项") ?? "");
const vars = {
  title: opts.title ?? "进展汇报",
  generatedAt: `生成于 ${new Date().toISOString().slice(0, 16).replace("T", " ")}Z`,
  lead, progress, current,
  sliceTable: renderSlices(rows),
  architecture: renderArchitecture(read(opts.before, "前图"), read(opts.after, "后图")),
  metrics: renderMetrics(json(opts.metrics, "结构读数"), json(opts.mutation, "差分变异")),
  remaining: renderRemaining(rows),
  decisions,
  demo: renderDemo(opts.demo),
};
const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "report-template.html"), "utf8");
writeFileSync(resolve(opts.out), renderReport(template, vars));
console.log(resolve(opts.out));
