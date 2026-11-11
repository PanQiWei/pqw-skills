// 生成 README 的「技能集全景」信息图：assets/map.svg（中文）与 assets/map-en.svg（英文）。
// 改了上下文地图、增删技能或脚本之后重跑：node assets/gen-map.mjs
// 矩阵从 design/context-map.json 读，图不手抄。视觉用 kami 的规范，见 DEVELOPMENT.md。
import { readFileSync, writeFileSync } from "node:fs";

const map = JSON.parse(readFileSync(new URL("../design/context-map.json", import.meta.url), "utf8"));
const KIND = { 主: "M", 空: "S", 行: "L" };
const keyOf = (row) => (row === "交接点" ? "h" : /^(\d+) /.exec(row)?.[1]);

const ZH = {
  file: "map.svg",
  aria: "pqw-skills 技能集全景：流程轴十三个环节，思维轴六个模型，一个诤友，以及入口、教学、写作技能与自带脚本",
  title: "技能集全景：24 个技能，两条轴",
  sub: "横着是流程：现在走到哪一步。竖着是想法：这一步怎么想。交点是它们相遇的地方。",
  flow: "流程轴", flowN: "13 个环节", think: "思维轴", thinkN: "6 个模型", countX: 96,
  define: "定义期 · 你主导", deliver: "交付期 · agent 自主",
  steps: [["需求", "不变式"], ["领域", "影响"], ["调研", "复用"], ["形式化", "守护"], ["细化", "设计"], ["正式", "落盘"], ["spec", "plan"], ["前置", "消熵"], ["派发", ""], ["定期", "回看"], ["切片", "收口"], ["向人", "汇报"], ["清理", ""]],
  short: { "think-orthogonal": "拆", "think-ought-vs-is": "找差异", "think-model-first": "定形", "think-right-then-well": "建", "think-evidence": "证", "think-closed-loop": "转手", "candid-friend": "对人" },
  legend: [[212, "这一步的产出本身就是它"], [405, "模板里给它留了空位"], [592, "在要用到它的那一步有一句指路"], [830, "交接点"]],
  stepsTitle: "13 个环节，各回答一个问题",
  questions: ["给用户什么能力，永远守住什么", "哪些领域受影响，边界怎么摆", "有没有现成的可以复用", "哪些性质靠测试守不住", "对象、关系、仓储长什么样", "哪些写成正式文档，落在哪层", "做到什么算完，切成哪几片", "动手前要先知道什么", "什么自己做，什么派出去", "有没有偏离、兜圈、腐化", "承诺的做到了没有", "怎么让人十分钟看懂进展", "什么该清，什么等人验"],
  boxes: [
    ["入口与教学", [["single-session-dev-flow", "总入口：够不够格、顺序、交接点"], ["teach-pqw-skills", "教人怎么用这套流，跑偏了怎么纠"]]],
    ["写作", [["clear-writing", "文档、提示词、技能的清晰写作"], ["write-agents-md", "项目入口文件怎么写、怎么治理"]]],
    ["给你的项目", [["resident-card", "常驻卡片，原样放进项目入口文件"], ["接入点", "一张表填你项目的命令与位置"]]],
  ],
  toolsTitle: "自带的脚本", toolsSub: "直接 node 跑，结果确定，不靠模型判断", toolsSubX: 170,
  tools: ["核计划的结构", "找一个改动的消费者", "核派发简报", "哨兵取工作树事实", "结构读数", "差分变异", "生成网页汇报件", "给 demo 追加一段", "列出并清理中间产物"],
  font: '"TsangerJinKai02", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "STSong", Charter, Georgia, serif',
};
const EN = {
  file: "map-en.svg",
  aria: "pqw-skills at a glance: thirteen steps on the flow axis, six models on the thinking axis, one candid friend, plus the entry, teaching and writing skills and the bundled scripts",
  title: "The whole set: 24 skills, two axes",
  sub: "Across: the flow, where you are. Down: the thinking, how to do this step. Dots mark where they meet.",
  flow: "FLOW", flowN: "13 steps", think: "THINKING", thinkN: "6 models", countX: 126,
  define: "Definition · you lead", deliver: "Delivery · agent runs it",
  steps: [["Need &amp;", "invariants"], ["Domain", "impact"], ["Research", "&amp; reuse"], ["Formal", "guard"], ["Detailed", "design"], ["Docs", "landing"], ["spec", "plan"], ["Context", "pack"], ["Delegate", ""], ["Timed", "review"], ["Slice", "closeout"], ["Report", "to human"], ["Cleanup", ""]],
  short: { "think-orthogonal": "Decompose", "think-ought-vs-is": "Find the gap", "think-model-first": "Shape", "think-right-then-well": "Build", "think-evidence": "Prove", "think-closed-loop": "Hand off", "candid-friend": "To the human" },
  legend: [[212, "the step's output is the model"], [420, "a slot in the template"], [592, "a pointer line at the step"], [830, "handoff"]],
  stepsTitle: "13 steps, one question each",
  questions: ["What users get; what must always hold", "Which domains change; where borders go", "Is something ready to reuse", "Which properties tests cannot guard", "Objects, relations, storage shapes", "What becomes a formal doc, and where", "What counts as done; which slices", "What to know before starting", "Do it yourself, or delegate", "Any drift, looping or context rot", "Were the promises kept", "How a human gets it in ten minutes", "What to clean; what awaits review"],
  boxes: [
    ["Entry and teaching", [["single-session-dev-flow", "Entry: who qualifies, order, handoff"], ["teach-pqw-skills", "Teaches people how to use the flow"]]],
    ["Writing", [["clear-writing", "Clear writing for docs and prompts"], ["write-agents-md", "How to write and govern AGENTS.md"]]],
    ["For your project", [["resident-card", "A resident card for your entry file"], ["access points", "One table: your commands and paths"]]],
  ],
  toolsTitle: "Bundled scripts", toolsSub: "run with node; deterministic, no model judgment", toolsSubX: 212,
  tools: ["Checks plan structure", "Finds a change's consumers", "Checks a delegation brief", "Sentinel's worktree facts", "Structure metrics", "Differential mutation", "Builds the web report", "Appends a demo section", "Lists and cleans leftovers"],
  font: 'Charter, "Iowan Old Style", Georgia, "Times New Roman", serif',
};

const stepSkills = ["requirement-and-invariants", "domain-impact-analysis", "tech-research-and-reuse", "formal-guard", "detailed-domain-design", "formal-docs-landing", "spec-and-plan", "context-pack", "delegate-brief", "one-lesson-rule", "slice-closeout", "progress-artifacts", "cleanup"];
const toolNames = ["check-plan", "consumers", "check-brief", "sentinel", "metrics", "mutation", "build-report", "demo-append", "cleanup"];

function build(T) {
  const W = 960, X0 = 204, CW = 55;
  const cx = (i) => X0 + (i - 1) * CW + CW / 2;
  const rows = map.models.map((m) => {
    const cells = {};
    for (const r of map.rows) {
      const k = keyOf(r.row);
      const kind = r.cells[m.skill]?.kind;
      if (k && kind) cells[k] = KIND[kind];
    }
    return [T.short[m.skill] ?? m.name, m.skill, cells];
  });
  const friendCells = {};
  for (const c of map.crosscut[0].cells) {
    const k = keyOf(c.row);
    if (k) friendCells[k] = KIND[c.kind] ?? "L";
  }
  const friend = [T.short[map.crosscut[0].skill], map.crosscut[0].skill, friendCells];

  const o = [];
  const p = (s) => o.push(s);
  const mark = (x, y, k, cls) => {
    if (k === "M") p(`<circle class="${cls}" cx="${x}" cy="${y}" r="8"/>`);
    else if (k === "S") p(`<rect class="${cls}" x="${x - 7}" y="${y - 7}" width="14" height="14" rx="3"/>`);
    else if (k === "L") p(`<circle class="${cls}ln" cx="${x}" cy="${y}" r="6"/>`);
  };

  p(`<rect class="bg" x="0" y="0" width="${W}" height="HEIGHT"/>`);
  p(`<text class="eyebrow" x="40" y="52">PQW-SKILLS</text>`);
  p(`<text class="title" x="40" y="98">${T.title}</text>`);
  p(`<text class="sub" x="40" y="130">${T.sub}</text>`);
  p(`<line x1="40" y1="156" x2="920" y2="156" stroke="#1B365D" stroke-width="0.8"/>`);

  let y = 180;
  p(`<rect class="humanbg" x="${X0}" y="${y}" width="${CW * 6 - 4}" height="26" rx="6"/>`);
  p(`<text class="h3 human" x="${X0 + 12}" y="${y + 18}">${T.define}</text>`);
  p(`<rect class="agentbg" x="${X0 + CW * 6 + 4}" y="${y}" width="${CW * 7 - 4}" height="26" rx="6"/>`);
  p(`<text class="h3 agent" x="${X0 + CW * 6 + 16}" y="${y + 18}">${T.deliver}</text>`);
  p(`<text class="act" x="40" y="${y + 18}">${T.flow}</text>`);
  p(`<text class="s" x="${T.countX}" y="${y + 18}">${T.flowN}</text>`);

  y = 222;
  T.steps.forEach(([a, b], i) => {
    const x = cx(i + 1);
    const cls = i < 6 ? "human" : "agent";
    p(`<text class="colnum ${cls}" x="${x}" y="${y + 16}" text-anchor="middle">${i + 1}</text>`);
    p(`<text class="s ink" x="${x}" y="${y + 36}" text-anchor="middle">${a}</text>`);
    if (b) p(`<text class="s ink" x="${x}" y="${y + 52}" text-anchor="middle">${b}</text>`);
  });
  const hx = X0 + CW * 6;
  const gridTop = 286, RH = 40;
  const n = rows.length;
  const gridBottom = gridTop + RH * (n + 1) + 14;
  p(`<line class="goodln" x1="${hx}" y1="${y - 6}" x2="${hx}" y2="${gridBottom}"/>`);
  p(`<path class="good" d="M${hx},${y - 16} L${hx + 7},${y - 6} L${hx},${y + 4} L${hx - 7},${y - 6} Z"/>`);

  p(`<text class="act" x="40" y="${gridTop - 10}">${T.think}</text>`);
  p(`<text class="s" x="${T.countX}" y="${gridTop - 10}">${T.thinkN}</text>`);
  rows.forEach(([name, sk, cells], r) => {
    const ry = gridTop + r * RH;
    if (r % 2 === 0) p(`<rect class="stripe" x="40" y="${ry}" width="880" height="${RH}" rx="6"/>`);
    p(`<text class="h3 agent" x="52" y="${ry + 18}">${name}</text>`);
    p(`<text class="mono mut" x="52" y="${ry + 33}">${sk}</text>`);
    for (const [k, v] of Object.entries(cells)) mark(k === "h" ? hx : cx(Number(k)), ry + RH / 2, v, "agent");
  });
  {
    const ry = gridTop + n * RH + 14;
    p(`<line class="rule" x1="40" y1="${ry - 7}" x2="920" y2="${ry - 7}"/>`);
    p(`<rect class="humanstripe" x="40" y="${ry}" width="880" height="${RH}" rx="6"/>`);
    p(`<text class="h3 human" x="52" y="${ry + 18}">${friend[0]}</text>`);
    p(`<text class="mono mut" x="52" y="${ry + 33}">${friend[1]}</text>`);
    for (const [k, v] of Object.entries(friend[2])) mark(k === "h" ? hx : cx(Number(k)), ry + RH / 2, v, "human");
  }
  y = gridBottom + RH + 16;
  const [l1, l2, l3, l4] = T.legend;
  p(`<circle class="agent" cx="${l1[0]}" cy="${y}" r="8"/><text class="s" x="${l1[0] + 16}" y="${y + 4}">${l1[1]}</text>`);
  p(`<rect class="agent" x="${l2[0]}" y="${y - 7}" width="14" height="14" rx="3"/><text class="s" x="${l2[0] + 23}" y="${y + 4}">${l2[1]}</text>`);
  p(`<circle class="agentln" cx="${l3[0]}" cy="${y}" r="6"/><text class="s" x="${l3[0] + 14}" y="${y + 4}">${l3[1]}</text>`);
  p(`<path class="good" d="M${l4[0]},${y - 9} L${l4[0] + 7},${y} L${l4[0]},${y + 9} L${l4[0] - 7},${y} Z"/><text class="s" x="${l4[0] + 14}" y="${y + 4}">${l4[1]}</text>`);

  y += 34;
  p(`<line class="rule" x1="40" y1="${y}" x2="920" y2="${y}"/>`);
  y += 38;
  p(`<text class="h2" x="40" y="${y}">${T.stepsTitle}</text>`);
  y += 16;
  stepSkills.forEach((sk, i) => {
    const col = i < 7 ? 0 : 1;
    const row = i < 7 ? i : i - 7;
    const x = 40 + col * 450, ly = y + row * 28;
    const cls = i < 6 ? "human" : "agent";
    p(`<rect class="${cls}bg" x="${x}" y="${ly}" width="26" height="20" rx="5"/><text class="s ${cls}" x="${x + 13}" y="${ly + 14}" text-anchor="middle" style="font-weight:700">${i + 1}</text>`);
    p(`<text class="mono ink" x="${x + 36}" y="${ly + 14}">${sk}</text>`);
    p(`<text class="s" x="${x + 232}" y="${ly + 14}">${T.questions[i]}</text>`);
  });
  y += 7 * 28 + 10;
  p(`<line class="rule" x1="40" y1="${y}" x2="920" y2="${y}"/>`);

  y += 24;
  T.boxes.forEach(([title, lines], bi) => {
    const x = 40 + bi * 300;
    p(`<rect class="card" x="${x}" y="${y}" width="280" height="${48 + lines.length * 40}" rx="6"/>`);
    p(`<text class="h3" x="${x + 16}" y="${y + 26}">${title}</text>`);
    lines.forEach(([sk, d], i) => {
      p(`<text class="mono agent" x="${x + 16}" y="${y + 52 + i * 40}">${sk}</text>`);
      p(`<text class="s" x="${x + 16}" y="${y + 69 + i * 40}">${d}</text>`);
    });
  });
  y += 48 + 80 + 44;

  p(`<text class="h2" x="40" y="${y + 6}">${T.toolsTitle}</text>`);
  p(`<text class="s" x="${T.toolsSubX}" y="${y + 6}">${T.toolsSub}</text>`);
  y += 22;
  toolNames.forEach((name, i) => {
    const x = 40 + (i % 3) * 300, ty = y + Math.floor(i / 3) * 38;
    p(`<rect class="chip" x="${x}" y="${ty}" width="280" height="30" rx="6"/>`);
    p(`<text class="mono agent" x="${x + 12}" y="${ty + 20}">${name}</text>`);
    p(`<text class="s" x="${x + 118}" y="${ty + 20}">${T.tools[i]}</text>`);
  });
  y += 3 * 38 + 14;

  const H = y + 10;
  const style = `
    /* kami 的皮肤：羊皮纸底、一个墨蓝强调色、暖灰、衬线字、细线。色值都取自 kami 的 tokens。 */
    svg { --bg:#f5f4ed; --ink:#141413; --mut:#504e49; --stone:#6b6a64; --line:#d8d5c8; --card:#faf9f5; --stripe:#EEEDE6; --human:#141413; --humanbg:#faf9f5; --agent:#1B365D; --agentbg:#EEF2F7; --good:#1B365D; }
    text { font-family: ${T.font}; fill: var(--ink); }
    .bg { fill: var(--bg); }
    .eyebrow { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; font-weight: 600; fill: var(--agent); letter-spacing: 3px; }
    .title { font-size: 34px; font-weight: 600; }
    .sub { font-size: 15px; fill: var(--mut); }
    .act { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; font-weight: 600; letter-spacing: 2px; fill: var(--agent); }
    .h2 { font-size: 20px; font-weight: 600; }
    .h3 { font-size: 14px; font-weight: 600; }
    .s { font-size: 12px; fill: var(--stone); }
    .ink { fill: var(--ink); } .mut { fill: var(--stone); }
    .colnum { font-size: 18px; font-weight: 600; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; letter-spacing: 0.3px; }
    .card { fill: var(--card); stroke: var(--line); stroke-width: 1; }
    .chip { fill: var(--card); stroke: var(--line); stroke-width: 1; }
    .stripe { fill: var(--stripe); }
    .humanstripe { fill: var(--card); stroke: var(--ink); stroke-width: 1; }
    .rule { stroke: var(--line); stroke-width: 1; }
    .human { fill: var(--human); } .humanbg { fill: var(--humanbg); stroke: var(--human); stroke-width: 1; } .humanln { fill: var(--bg); stroke: var(--human); stroke-width: 2; }
    .agent { fill: var(--agent); } .agentbg { fill: var(--agentbg); stroke: var(--agent); stroke-width: 1; } .agentln { fill: var(--bg); stroke: var(--agent); stroke-width: 2; }
    .good { fill: var(--good); } .goodln { stroke: var(--good); stroke-width: 1.5; stroke-dasharray: 4 4; }`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${T.aria}">
  <title>${T.title}</title>
  <style>${style}
  </style>
  ${o.join("\n  ").replace("HEIGHT", String(H))}
</svg>
`;
  writeFileSync(new URL(`./${T.file}`, import.meta.url), svg);
  console.log(T.file, "height", H);
}

build(ZH);
build(EN);
