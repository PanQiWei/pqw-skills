#!/usr/bin/env node
// 汇报件生成：把 plan 的进度总览、结构读数与差分变异的 JSON、架构前后图合成一份单文件 HTML。
// 用法：build-report.mjs --plan <plan.md> --out <html> [--title <标题>] [--metrics <json>] [--mutation <json>] [--before <mermaid>] [--after <mermaid>] [--decisions <md>] [--demo <路径>]
// 退出 0 正常；1 输入文件读不到；2 用法错误。
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "用法：build-report.mjs --plan <plan.md> --out <html> [--title <标题>] [--metrics <json>] [--mutation <json>] [--before <mermaid>] [--after <mermaid>] [--decisions <md>] [--demo <路径>]";
const opts = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0); }
  if (!a.startsWith("--") || i + 1 >= argv.length) { console.error(`参数错误 ${a}`); console.error(USAGE); process.exit(2); }
  opts[a.slice(2)] = argv[++i];
}
if (!opts.plan || !opts.out) { console.error(USAGE); process.exit(2); }

const read = (p, label) => { try { return readFileSync(resolve(p), "utf8"); } catch { console.error(`读不到${label}：${p}`); process.exit(1); } };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

// ---- plan 的进度总览
const plan = read(opts.plan, " plan");
const progress = /^进度：(.*)$/m.exec(plan)?.[1]?.trim() ?? "没有进度行";
const current = /^当前：(.*)$/m.exec(plan)?.[1]?.trim() ?? "";
const overview = plan.split(/^## 进度总览\s*$/m)[1]?.split(/^## /m)[0] ?? "";
const rows = [];
for (const line of overview.split("\n")) {
  const cells = line.trim().startsWith("|") ? line.trim().slice(1, -1).split("|").map((c) => c.trim()) : null;
  if (!cells || cells.length < 4 || cells[0] === "切片" || /^-+$/.test(cells[0])) continue;
  if (!/^\d+$/.test(cells[0])) continue;
  rows.push({ id: cells[0], behavior: cells[1], criteria: cells[2], status: cells[3] });
}
const statusClass = (s) => (s.startsWith("已完成") ? "st-done" : s.startsWith("进行中") ? "st-doing" : s.startsWith("受阻") ? "st-blocked" : "st-todo");
const sliceTable = rows.length ? `<table><thead><tr><th>切片</th><th>交付的行为</th><th>验收</th><th>状态</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.id)}</td><td>${inline(r.behavior)}</td><td>${esc(r.criteria)}</td><td class="${statusClass(r.status)}">${esc(r.status)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">plan 里没有切片表。</p>`;
const remainingRows = rows.filter((r) => !r.status.startsWith("已完成") && !r.status.startsWith("跳过"));
const remaining = remainingRows.length ? `<ul>${remainingRows.map((r) => `<li>切片 ${esc(r.id)}：${inline(r.behavior)}<span class="muted">（${esc(r.status)}）</span></li>`).join("")}</ul>` : `<p>没有剩下的切片。</p>`;

// ---- 架构图
const fig = (title, text) => `<div class="fig"><h3>${esc(title)}</h3><pre class="mermaid">${esc(text.trim())}</pre></div>`;
let architecture = `<p class="muted">本次没有架构层面的变化。</p>`;
if (opts.before || opts.after) {
  const parts = [];
  if (opts.before) parts.push(fig("之前", read(opts.before, "前图")));
  if (opts.after) parts.push(fig("之后", read(opts.after, "后图")));
  architecture = `<div class="grid">${parts.join("")}</div><p class="muted">离线时图以 Mermaid 文本显示。</p>`;
}

// ---- 读数
const metricsJson = opts.metrics ? JSON.parse(read(opts.metrics, "结构读数")) : null;
const mutationJson = opts.mutation ? JSON.parse(read(opts.mutation, "差分变异")) : null;
const num = (v, d = 1) => (v === null || v === undefined ? "无覆盖" : Number(v).toFixed(d));
let metrics = "";
if (metricsJson) {
  const fs = metricsJson.functions ?? [];
  metrics += `<p>改动函数 ${fs.length} 个；圈复杂度最高 ${metricsJson.summary?.maxCyclomatic ?? "未测量"}，认知复杂度最高 ${metricsJson.summary?.maxCognitive ?? "未测量"}，CRAP 最高 ${metricsJson.summary?.maxCrap === null || metricsJson.summary?.maxCrap === undefined ? "无覆盖" : num(metricsJson.summary.maxCrap)}。</p>`;
  if (fs.length) metrics += `<table><thead><tr><th>函数</th><th>文件</th><th>行</th><th>圈复杂度</th><th>认知复杂度</th><th>覆盖率</th><th>CRAP</th></tr></thead><tbody>${fs.slice(0, 20).map((f) => `<tr><td>${esc(f.name)}</td><td>${esc(f.path)}</td><td>${f.startLine}-${f.endLine}</td><td>${f.cyclomatic}</td><td>${f.cognitive}</td><td>${f.coverage === null || f.coverage === undefined ? "无覆盖" : (f.coverage * 100).toFixed(0) + "%"}</td><td>${num(f.crap)}</td></tr>`).join("")}</tbody></table>${fs.length > 20 ? `<p class="muted">只列前 20 个，完整读数在 JSON。</p>` : ""}`;
  if (metricsJson.uncovered?.length) metrics += `<p class="muted">未覆盖的改动文件：${metricsJson.uncovered.map((u) => `${esc(u.path)}（${esc(u.reason)}）`).join("；")}</p>`;
} else metrics += `<p>结构读数：未测量。</p>`;
if (mutationJson) {
  const s = mutationJson.summary ?? {};
  metrics += `<p>差分变异：位点 ${s.total ?? 0}，杀死 ${s.killed ?? 0}、存活 ${s.survived ?? 0}、无覆盖 ${s.uncovered ?? 0}、未跑 ${s.notRun ?? 0}；分数 ${s.score === null || s.score === undefined ? "无" : (s.score * 100).toFixed(0) + "%"}${mutationJson.budget?.exceeded ? "；预算用尽" : ""}。</p>`;
  if (mutationJson.survivors?.length) metrics += `<p>存活的位点：</p><ul>${mutationJson.survivors.map((v) => `<li><code>${esc(v.file)}:${v.line}</code> ${esc(v.unit)}：<code>${esc(v.original)}</code> 换成 <code>${esc(v.mutant === "" ? "（删去）" : v.mutant)}</code>。${esc(v.suggestion ?? "")}</li>`).join("")}</ul>`;
} else metrics += `<p>差分变异：未测量。</p>`;
metrics += `<p class="muted">读数是线索，不是结论。</p>`;

// ---- 等你决定与体验
const decisionsText = opts.decisions ? read(opts.decisions, "待决事项").trim() : "";
const decisionItems = decisionsText.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
const decisions = decisionItems.length ? `<ul>${decisionItems.map((d) => `<li>${inline(d)}</li>`).join("")}</ul>` : `<p>没有等你决定的。</p>`;
const lead = decisionItems.length ? `有 ${decisionItems.length} 件事等你决定，见末尾。` : "没有等你决定的。";
const demo = opts.demo ? `<p>demo：<a href="${esc(opts.demo)}">${esc(opts.demo)}</a>，直接在浏览器打开。</p>` : `<p>本次没有可上手的变化。</p>`;

const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "report-template.html"), "utf8");
const vars = { title: opts.title ?? "进展汇报", generatedAt: `生成于 ${new Date().toISOString().slice(0, 16).replace("T", " ")}Z`, lead, progress, current, sliceTable, architecture, metrics, remaining, decisions, demo };
const html = template.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? (k === "title" || k === "generatedAt" || k === "lead" || k === "progress" || k === "current" ? esc(vars[k]) : vars[k]) : ""));
writeFileSync(resolve(opts.out), html);
console.log(resolve(opts.out));
