#!/usr/bin/env node
// 汇报件生成：把 plan 的进度总览、结构读数与差分变异的 JSON、架构前后图合成一份单文件 HTML。逻辑在 lib/report.mjs，本文件只是命令面。
// 用法：build-report.mjs --plan <plan.md> --out <html> [--title <标题>] [--metrics <json>] [--mutation <json>] [--before <mermaid>] [--after <mermaid>] [--decisions <md>] [--demo <路径>]
// 生成前用 spec-and-plan 的 check-plan 核 plan 结构，结果写在网页顶部；核不了（不是模板格式、找不到脚本）也照生成，写「未核结构」。测试可用 PQW_CHECK_PLAN 指定脚本位置。
// 退出 0 正常；1 输入文件读不到；2 用法错误。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseOptions } from "./lib/args.mjs";
import { parseOverview, parseNarrative, renderNarrative, renderSlices, renderRemaining, renderArchitecture, renderMetrics, renderDecisions, renderDemo, renderReport } from "./lib/report.mjs";

const USAGE = "用法：build-report.mjs --plan <plan.md> --out <html> [--title <标题>] [--metrics <json>] [--mutation <json>] [--before <mermaid>] [--after <mermaid>] [--decisions <md>] [--demo <路径>]";
const { opts, help, error } = parseOptions(process.argv.slice(2));
if (help) { console.log(USAGE); process.exit(0); }
if (error) { console.error(error); console.error(USAGE); process.exit(2); }
if (!opts.plan || !opts.out) { console.error(USAGE); process.exit(2); }

/** 读输入文件；没给路径返回 null，读不到退出 1。 */
const read = (p, label) => { if (!p) return null; try { return readFileSync(resolve(p), "utf8"); } catch { console.error(`读不到${label}：${p}`); process.exit(1); } };
const json = (p, label) => { const text = read(p, label); return text === null ? null : JSON.parse(text); };

/** plan 结构核对的一句话：合模板、N 处缺陷，或为什么没核。 */
function structureNote(planPath, planText) {
  if (!/^# .+ 交付计划（revision \d+）/m.test(planText)) return "未核结构：plan 抬头不是模板格式";
  const script = process.env.PQW_CHECK_PLAN ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "spec-and-plan", "scripts", "check-plan.mjs");
  if (!existsSync(script)) return "未核结构：找不到 check-plan";
  const r = spawnSync(process.execPath, [script, "--plan", planPath, "--format", "json"], { encoding: "utf8" });
  try {
    const parsed = JSON.parse(r.stdout);
    return parsed.ok ? "plan 结构合模板" : `plan 结构不合模板：${parsed.defects.length} 处缺陷`;
  } catch {
    return `未核结构：check-plan 没有给出结果（退出 ${r.status}）`;
  }
}

const planText = read(opts.plan, " plan");
const { progress, current, rows } = parseOverview(planText);
const narrative = parseNarrative(planText);
const { decisions, lead } = renderDecisions(read(opts.decisions, "待决事项") ?? "");
const vars = {
  title: opts.title ?? "进展汇报",
  generatedAt: `生成于 ${new Date().toISOString().slice(0, 16).replace("T", " ")}Z`,
  lead, progress, current,
  structure: structureNote(resolve(opts.plan), planText),
  narrative: renderNarrative(narrative),
  sliceTable: renderSlices(rows, narrative.meanings),
  architecture: renderArchitecture(read(opts.before, "前图"), read(opts.after, "后图")),
  metrics: renderMetrics(json(opts.metrics, "结构读数"), json(opts.mutation, "差分变异")),
  remaining: renderRemaining(rows),
  decisions,
  demo: renderDemo(opts.demo),
};
const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "report-template.html"), "utf8");
writeFileSync(resolve(opts.out), renderReport(template, vars));
console.log(resolve(opts.out));
