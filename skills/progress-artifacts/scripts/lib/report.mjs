// 汇报件生成的逻辑：读 plan 进度总览、渲染各节、套模板。只处理文本，不读文件。
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

/** plan 的进度总览：进度行、当前行、切片表的行。 */
export function parseOverview(plan) {
  const progress = /^进度：(.*)$/m.exec(plan)?.[1]?.trim() ?? "没有进度行";
  const current = /^当前：(.*)$/m.exec(plan)?.[1]?.trim() ?? "";
  const overview = plan.split(/^## 进度总览\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  const rows = [];
  for (const line of overview.split("\n")) {
    const cells = line.trim().startsWith("|") ? line.trim().slice(1, -1).split("|").map((c) => c.trim()) : null;
    if (!cells || cells.length < 4 || !/^\d+$/.test(cells[0])) continue;
    rows.push({ id: cells[0], behavior: cells[1], criteria: cells[2], status: cells[3] });
  }
  return { progress, current, rows };
}

export const statusClass = (s) => (s.startsWith("已完成") ? "st-done" : s.startsWith("进行中") ? "st-doing" : s.startsWith("受阻") ? "st-blocked" : "st-todo");

export function renderSlices(rows) {
  if (!rows.length) return `<p class="muted">plan 里没有切片表。</p>`;
  const body = rows.map((r) => `<tr><td>${esc(r.id)}</td><td>${inline(r.behavior)}</td><td>${esc(r.criteria)}</td><td class="${statusClass(r.status)}">${esc(r.status)}</td></tr>`).join("");
  return `<table><thead><tr><th>切片</th><th>交付的行为</th><th>验收</th><th>状态</th></tr></thead><tbody>${body}</tbody></table>`;
}

export function renderRemaining(rows) {
  const left = rows.filter((r) => !r.status.startsWith("已完成") && !r.status.startsWith("跳过"));
  if (!left.length) return `<p>没有剩下的切片。</p>`;
  return `<ul>${left.map((r) => `<li>切片 ${esc(r.id)}：${inline(r.behavior)}<span class="muted">（${esc(r.status)}）</span></li>`).join("")}</ul>`;
}

const fig = (title, text) => `<div class="fig"><h3>${esc(title)}</h3><pre class="mermaid">${esc(text.trim())}</pre></div>`;

/** before、after 是 Mermaid 文本或 null。 */
export function renderArchitecture(before, after) {
  if (before === null && after === null) return `<p class="muted">本次没有架构层面的变化。</p>`;
  const parts = [];
  if (before !== null) parts.push(fig("之前", before));
  if (after !== null) parts.push(fig("之后", after));
  return `<div class="grid">${parts.join("")}</div><p class="muted">离线时图以 Mermaid 文本显示。</p>`;
}

const num = (v, d = 1) => (v === null || v === undefined ? "无覆盖" : Number(v).toFixed(d));
const pct = (c) => (c === null || c === undefined ? "无覆盖" : (c * 100).toFixed(0) + "%");

/** 「原 → 现」：没有趋势字段（旧读数）写空；新函数写「新 → 现」。 */
const trendText = (f) => (f.trend === undefined ? "" : f.trend === "new" ? `新 → ${f.cyclomatic}` : `${f.baseline?.cyclomatic} → ${f.cyclomatic}`);

/** 读数段的导语：最高值，有基线比时加要交代几个。 */
function metricsLead(fs, s) {
  const worse = s.explain ? `；要交代 ${s.explain.length} 个变差，另有 ${s.overLineNotWorse ?? 0} 个过线但没有变差` : "";
  return `<p>改动函数 ${fs.length} 个；圈复杂度最高 ${s.maxCyclomatic ?? "未测量"}，认知复杂度最高 ${s.maxCognitive ?? "未测量"}，CRAP 最高 ${num(s.maxCrap)}${worse}。</p>`;
}

const metricsRow = (f) => `<tr><td>${esc(f.name)}</td><td>${esc(f.path)}</td><td>${f.startLine}-${f.endLine}</td><td>${f.cyclomatic}</td><td>${f.cognitive}</td><td>${pct(f.coverage)}</td><td>${num(f.crap)}</td><td>${esc(f.band ?? "")}</td><td>${esc(trendText(f))}</td><td>${f.worse ? "!" : ""}</td></tr>`;

/** 一段 muted 的清单，空清单不出。 */
const mutedList = (label, items) => (items?.length ? `<p class="muted">${label}：${items.join("；")}</p>` : "");

function renderMetricsJson(m) {
  const fs = m.functions ?? [];
  let out = metricsLead(fs, m.summary ?? {});
  if (fs.length) {
    out += `<table><thead><tr><th>函数</th><th>文件</th><th>行</th><th>圈复杂度</th><th>认知复杂度</th><th>覆盖率</th><th>CRAP</th><th>带位</th><th>原 → 现</th><th>变差</th></tr></thead><tbody>${fs.slice(0, 20).map(metricsRow).join("")}</tbody></table>`;
    if (fs.length > 20) out += `<p class="muted">只列前 20 个，完整读数在 JSON。</p>`;
  }
  out += mutedList("警告", m.warnings?.map(esc));
  out += mutedList("未覆盖的改动文件", m.uncovered?.map((u) => `${esc(u.path)}（${esc(u.reason)}）`));
  return out;
}

/** 变异段的导语：无效写原因；有效写四类计数、其中超时、分数、预算。 */
function mutationLead(s, budget) {
  if (s.valid === false) return `<p>差分变异：测量无效（${esc(s.invalidReason ?? "")}）。</p>`;
  const n = (v) => v ?? 0;
  const timedOut = s.timedOut ? `（其中超时 ${s.timedOut}）` : "";
  const score = s.score === null || s.score === undefined ? "无" : (s.score * 100).toFixed(0) + "%";
  return `<p>差分变异：位点 ${n(s.total)}，杀死 ${n(s.killed)}${timedOut}、存活 ${n(s.survived)}、无覆盖 ${n(s.uncovered)}、未跑 ${n(s.notRun)}；分数 ${score}${budget?.exceeded ? "；预算用尽" : ""}。</p>`;
}

const survivorItem = (v) => `<li><code>${esc(v.file)}:${v.line}</code> ${esc(v.unit)}：<code>${esc(v.original)}</code> 换成 <code>${esc(v.mutant === "" ? "（删去）" : v.mutant)}</code>。${esc(v.suggestion ?? "")}</li>`;
const unmutatedItem = (u) => `${esc(u.file)}:${u.lines[0]}-${u.lines[1]}${u.unit ? " " + esc(u.unit) : ""}（${esc(u.reason)}）`;

function renderMutationJson(mu) {
  let out = mutationLead(mu.summary ?? {}, mu.budget);
  if (mu.survivors?.length) out += `<p>存活的位点：</p><ul>${mu.survivors.map(survivorItem).join("")}</ul>`;
  out += mutedList("没有位点的改动段（不进分数）", mu.unmutated?.map(unmutatedItem));
  return out;
}

/** 两份读数 JSON（已解析）或 null。 */
export function renderMetrics(metricsJson, mutationJson) {
  const a = metricsJson ? renderMetricsJson(metricsJson) : `<p>结构读数：未测量。</p>`;
  const b = mutationJson ? renderMutationJson(mutationJson) : `<p>差分变异：未测量。</p>`;
  return `${a}${b}<p class="muted">读数是线索，不是结论。</p>`;
}

/** 待决事项的 markdown 列表文本（或空串）。返回列表 HTML 与导语。 */
export function renderDecisions(text) {
  const items = text.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  const decisions = items.length ? `<ul>${items.map((d) => `<li>${inline(d)}</li>`).join("")}</ul>` : `<p>没有等你决定的。</p>`;
  const lead = items.length ? `有 ${items.length} 件事等你决定，见末尾。` : "没有等你决定的。";
  return { decisions, lead };
}

export const renderDemo = (demoPath) => (demoPath ? `<p>demo：<a href="${esc(demoPath)}">${esc(demoPath)}</a>，直接在浏览器打开。</p>` : `<p>本次没有可上手的变化。</p>`);

const ESCAPED_VARS = new Set(["title", "generatedAt", "lead", "progress", "current"]);

/** 套模板：五个纯文本变量转义，其余变量是已生成的 HTML 原样放入；模板里没对应值的占位写空。 */
export function renderReport(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? (ESCAPED_VARS.has(k) ? esc(vars[k]) : vars[k]) : ""));
}
