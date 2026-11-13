#!/usr/bin/env node
// 仓库一致性检查。只读，纯 Node，无依赖。退出 0 全部通过；退出 1 有失败；退出 2 用法错误。
// 核的是 AGENTS.md 布局与写作规则里能机器化的那部分：三处同步、引用可解析、无待写、无项目概念、无破折号、模板被链接、写代码的四条只有一处正文、圈外的问题只有一处正文、上下文地图的每一格兑现（含流程轴上的横切技能、阶段技能与常驻卡片）、连通性（流程轴技能开头的位置行，思维模型与横切技能回到上层的一行，每个技能至少被别的技能点到一次）。

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { sections as releaseSections, summary as releaseSummary } from "./release-notes.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const home = homedir();

// ---- 配置段。换机器只改这里。
const config = {
  skillsDir: join(repo, "skills"),
  metaSkillsDir: join(repo, "meta", "skills"),
  pluginJson: join(repo, ".claude-plugin", "plugin.json"),
  readme: join(repo, "README.md"),
  proseFiles: ["README.md", "README_EN.md", "AGENTS.md", "STRUCTURE.md", "CHANGELOG.md", "CONTRIBUTING.md", "DEVELOPMENT.md", "SECURITY.md", "CODE_OF_CONDUCT.md"],
  proseDirs: ["skills", "meta/skills", "design"],
  // 脚本与网页也扫禁词与破折号；tests/ 不扫，用例里会故意写禁词。本文件自身持有两张表，免检。
  codeDirs: ["skills", "meta/skills", "scripts"],
  codeExts: [".mjs", ".html"],
  // 外部技能安装根。pstack 与 Matt 取缓存里版本号最大的目录。
  pstackCache: join(home, ".claude", "plugins", "cache", "pstack-claude", "pstack"),
  mattCache: join(home, ".claude", "plugins", "cache", "mattpocock", "mattpocock-skills"),
  ubMode: join(home, ".claude", "skills", "ub-mode", "SKILL.md"),
  // 项目概念禁词：这些词出现在发行技能或模板里，就是没去干净 omne 的概念。
  forbidden: ["卡号", "attempt", "线父卡", "轨道", "准入", "名额", "Reduce", "pnpm run", ".meta_harness", "docs/engineering", "omne-harness-lite", "tmp/issue-", "taskBase", "dispatch-policy"],
  // 工作日志式措辞。
  workLog: ["我们现在", "这次改成", "原来是", "本次改为"],
  dashes: ["—", "–", "―"],
  // 宿主工具名：发行技能正文不写，宿主差异只在 one-lesson-rule/hosts.md。
  hostTools: ["Skill 工具", "Agent 工具", "SendMessage", "TaskCreate", "TodoWrite", "CronCreate"],
};

const args = process.argv.slice(2);
if (args.some((a) => !["--quiet"].includes(a))) {
  console.error("用法：node scripts/check-repo.mjs [--quiet]");
  process.exit(2);
}
const quiet = args.includes("--quiet");

const failures = [];
const fail = (check, message) => failures.push({ check, message });

const listDirs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()).sort() : []);
const read = (p) => readFileSync(p, "utf8");
const latestVersionDir = (cache) => {
  if (!existsSync(cache)) return null;
  const dirs = listDirs(cache);
  if (dirs.length === 0) return null;
  dirs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return join(cache, dirs[dirs.length - 1]);
};
const walkFiles = (dir, exts) => {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    if (n === "node_modules") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p, exts));
    else if (exts.some((e) => n.endsWith(e))) out.push(p);
  }
  return out;
};
const walkMd = (dir) => walkFiles(dir, [".md"]);
const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  return fm;
};
const rel = (p) => p.replace(repo + "/", "");

// ---- 1. 发行技能与元技能：目录结构、frontmatter、待写
const skills = listDirs(config.skillsDir);
const metaSkills = listDirs(config.metaSkillsDir);
const allSkillDirs = [...skills.map((n) => join(config.skillsDir, n)), ...metaSkills.map((n) => join(config.metaSkillsDir, n))];
for (const dir of allSkillDirs) {
  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) {
    fail("结构", `${rel(dir)} 没有 SKILL.md`);
    continue;
  }
  const text = read(skillMd);
  const fm = frontmatter(text);
  if (!fm) fail("frontmatter", `${rel(skillMd)} 没有 frontmatter`);
  else {
    if (fm.name !== basename(dir)) fail("frontmatter", `${rel(skillMd)} 的 name 是「${fm.name}」，目录是「${basename(dir)}」`);
    if (!fm.description || fm.description.length < 20) fail("frontmatter", `${rel(skillMd)} 的 description 缺失或过短`);
  }
  if (/^## 待写\s*$/m.test(text)) fail("待写", `${rel(skillMd)} 仍有「## 待写」节`);
  // 模板与附件要被 SKILL.md 链接
  for (const f of readdirSync(dir)) {
    if (f === "SKILL.md" || f === "README.md" || !f.endsWith(".md")) continue;
    if (!text.includes(`(${f})`) && !text.includes(`(./${f})`)) fail("模板链接", `${rel(join(dir, f))} 没有被 ${rel(skillMd)} 链接`);
  }
}

// ---- 2. 三处同步：skills/ 目录、plugin.json、README
let pluginSkills = [];
try {
  pluginSkills = JSON.parse(read(config.pluginJson)).skills.map((s) => s.replace(/^\.\/skills\//, ""));
} catch (e) {
  fail("plugin.json", `读不了 ${rel(config.pluginJson)}：${e.message}`);
}
for (const s of skills) if (!pluginSkills.includes(s)) fail("三处同步", `skills/${s} 不在 plugin.json 的 skills 数组`);
for (const s of pluginSkills) if (!skills.includes(s)) fail("三处同步", `plugin.json 列了 skills/${s}，目录不存在`);
for (const s of metaSkills) if (pluginSkills.includes(s)) fail("三处同步", `元技能 ${s} 不该出现在 plugin.json`);
const readme = read(config.readme);
for (const s of skills) if (!readme.includes(`./skills/${s}/SKILL.md`)) fail("三处同步", `README 技能表没有链接 skills/${s}`);

// ---- 3. 外部引用可解析，DMI 技能按「加载技能」措辞引用
const pstackRoot = latestVersionDir(config.pstackCache);
const mattRoot = latestVersionDir(config.mattCache);
const mattIndex = new Map();
if (mattRoot) {
  for (const bucket of listDirs(join(mattRoot, "skills"))) {
    for (const name of listDirs(join(mattRoot, "skills", bucket))) {
      const p = join(mattRoot, "skills", bucket, name, "SKILL.md");
      if (existsSync(p)) mattIndex.set(name, { bucket, dmi: /disable-model-invocation:\s*true/.test(read(p)) });
    }
  }
}
const checkedFiles = [...config.proseFiles.map((f) => join(repo, f)), ...config.proseDirs.flatMap((d) => walkMd(join(repo, d)))];
for (const file of checkedFiles) {
  const text = read(file);
  for (const m of text.matchAll(/`pstack:([a-z0-9-]+)`/g)) {
    if (!pstackRoot) {
      fail("无法核对", `${rel(file)} 引用 pstack:${m[1]}，本机没有 pstack 安装目录 ${config.pstackCache}`);
      break;
    }
    if (!existsSync(join(pstackRoot, "skills", m[1], "SKILL.md"))) fail("外部引用", `${rel(file)} 引用的 pstack:${m[1]} 在 ${basename(pstackRoot)} 里不存在`);
  }
  for (const m of text.matchAll(/`mattpocock-skills:([a-z0-9-]+)`/g)) {
    if (!mattRoot) {
      fail("无法核对", `${rel(file)} 引用 mattpocock-skills:${m[1]}，本机没有 Matt 安装目录 ${config.mattCache}`);
      break;
    }
    const entry = mattIndex.get(m[1]);
    if (!entry) fail("外部引用", `${rel(file)} 引用的 mattpocock-skills:${m[1]} 在 ${basename(mattRoot)} 里不存在`);
    else if (entry.dmi && new RegExp(`加载技能 \`mattpocock-skills:${m[1]}\``).test(text))
      fail("DMI", `${rel(file)} 写成加载技能 mattpocock-skills:${m[1]}，它声明了 disable-model-invocation: true，应写成按已安装路径读正文`);
  }
  if (/`ub-mode`/.test(text) && !existsSync(config.ubMode)) fail("无法核对", `${rel(file)} 引用 ub-mode，本机没有 ${config.ubMode}`);
}

// ---- 4. 发行技能、模板、脚本与网页里的项目概念禁词、工作日志措辞。skills/clear-writing 是原样引入的上游英文正文（attempt 是普通英文词），免检。
const self = fileURLToPath(import.meta.url);
const codeFiles = config.codeDirs.flatMap((d) => walkFiles(join(repo, d), config.codeExts)).filter((f) => f !== self);
for (const file of [...walkMd(config.skillsDir), ...walkMd(config.metaSkillsDir), ...codeFiles]) {
  if (file.includes("/skills/clear-writing/")) continue;
  const text = read(file);
  for (const w of config.forbidden) if (text.includes(w)) fail("项目概念", `${rel(file)} 含「${w}」`);
  for (const w of config.workLog) if (text.includes(w)) fail("工作日志措辞", `${rel(file)} 含「${w}」`);
}

// ---- 6. 发行技能与元技能宿主无关：正文不写宿主的工具名，宿主差异只许写在 one-lesson-rule/hosts.md。
for (const file of [...walkMd(config.skillsDir), ...walkMd(config.metaSkillsDir)]) {
  if (file.endsWith("/one-lesson-rule/hosts.md")) continue;
  const text = read(file);
  for (const w of config.hostTools) if (text.includes(w)) fail("宿主无关", `${rel(file)} 含宿主工具名「${w}」`);
}

// ---- 5. 全仓散文、脚本与网页无破折号。skills/clear-writing 是原样引入的上游英文正文，免检。
for (const file of [...checkedFiles, ...codeFiles]) {
  if (file.includes("/skills/clear-writing/")) continue;
  const lines = read(file).split("\n");
  lines.forEach((line, i) => {
    for (const d of config.dashes) if (line.includes(d)) fail("破折号", `${rel(file)}:${i + 1}`);
  });
}

// ---- 7. 工具版本常量与 plugin.json 一致：差分变异的历史指纹用它，不一致就沿用错历史。
function checkToolVersion() {
  try {
    const toolVersion = /TOOL_VERSION = "([^"]+)"/.exec(read(join(repo, "skills/slice-closeout/scripts/lib/version.mjs")))?.[1];
    const pluginVersion = JSON.parse(read(config.pluginJson)).version;
    if (toolVersion !== pluginVersion) fail("版本常量", `scripts/lib/version.mjs 的 TOOL_VERSION ${toolVersion} 与 plugin.json 的 ${pluginVersion} 不一致`);
    // 根目录的另外两份清单版本跟着 Claude 的清单走：plugin.json 给 Codex 与 Cursor，kimi.plugin.json 给 Kimi Code。
    for (const manifest of ["plugin.json", "kimi.plugin.json"]) {
      const version = JSON.parse(read(join(repo, manifest))).version;
      if (version !== pluginVersion) fail("版本常量", `${manifest} 的版本 ${version} 与 .claude-plugin/plugin.json 的 ${pluginVersion} 不一致`);
    }
  } catch (e) {
    fail("版本常量", e.message);
  }
}
checkToolVersion();

// ---- 8. 写代码的四条只有一处索引：入口技能那一节，四句结论各指向所属的思维模型技能。别处提到这几个短语的行必须带指向它的链接，或点名某个思维模型技能；思维模型技能自己的目录是正文所在，免检。
const FOUR_RULES_ENTRY = join(config.skillsDir, "single-session-dev-flow/SKILL.md");
const FOUR_RULES_PHRASES = ["先做对", "再做好", "找本质解"];
const FOUR_RULES_LINK = "SKILL.md#写代码的四条";
const THINK_HOOK_MARK = "`think-";
function checkFourRules() {
  const entry = read(FOUR_RULES_ENTRY);
  if (!entry.includes("\n## 写代码的四条\n")) fail("四条只有一处正文", `${rel(FOUR_RULES_ENTRY)} 缺「## 写代码的四条」一节`);
  for (const label of ["**先做对。**", "**再做好一轮。**", "**不过度设计，不提前优化。**", "**找本质解。**"]) {
    if (!entry.includes(label)) fail("四条只有一处正文", `${rel(FOUR_RULES_ENTRY)} 的四条缺「${label}」`);
  }
  if (!frontmatter(entry).description?.includes("写代码的四条")) fail("四条只有一处正文", `${rel(FOUR_RULES_ENTRY)} 的 description 没有提到「写代码的四条」`);
  for (const file of walkMd(config.skillsDir)) {
    if (file === FOUR_RULES_ENTRY || rel(file).startsWith("skills/think-")) continue;
    read(file).split("\n").forEach((line, i) => {
      if (FOUR_RULES_PHRASES.some((p) => line.includes(p)) && !line.includes(FOUR_RULES_LINK) && !line.includes(THINK_HOOK_MARK)) fail("四条只有一处正文", `${rel(file)}:${i + 1} 提到四条却没有链到入口那一节`);
    });
  }
}
checkFourRules();

// ---- 9. 圈外的问题只有一处正文：入口技能那一节，带处置表。别处提到「圈外发现」或「圈外的问题」的行必须带指向它的链接。标题行与 plan 进度总览的「圈外发现：」行是格式，放不下链接，豁免；链接放在那一节的说明段里。
const OUT_OF_SCOPE_PHRASES = ["圈外发现", "圈外的问题"];
const OUT_OF_SCOPE_LINK = "SKILL.md#圈外的问题";
const OUT_OF_SCOPE_TABLE = "| 它在哪 | 处置 |";
function checkOutOfScope() {
  const entry = read(FOUR_RULES_ENTRY);
  const at = entry.indexOf("\n## 圈外的问题\n");
  if (at < 0) fail("圈外的问题只有一处正文", `${rel(FOUR_RULES_ENTRY)} 缺「## 圈外的问题」一节`);
  else {
    const rest = entry.slice(at + 1);
    const next = rest.indexOf("\n## ");
    if (!(next < 0 ? rest : rest.slice(0, next)).includes(`\n${OUT_OF_SCOPE_TABLE}\n`)) fail("圈外的问题只有一处正文", `${rel(FOUR_RULES_ENTRY)} 的「## 圈外的问题」缺表「${OUT_OF_SCOPE_TABLE}」`);
  }
  for (const file of walkMd(config.skillsDir)) {
    if (file === FOUR_RULES_ENTRY) continue;
    read(file).split("\n").forEach((line, i) => {
      if (line.startsWith("#") || line.startsWith("圈外发现：")) return;
      if (OUT_OF_SCOPE_PHRASES.some((p) => line.includes(p)) && !line.includes(OUT_OF_SCOPE_LINK)) fail("圈外的问题只有一处正文", `${rel(file)}:${i + 1} 提到圈外的问题却没有链到入口那一节`);
    });
  }
}
checkOutOfScope();

// ---- 10. 上下文地图：design/context-map.json 的每一格在仓库里兑现（主：files 点名技能；行：files 含指路行；空：slots 的空位都在，列了 files 的另含指路行）；每个思维模型技能长成同一副骨架；模型的正文只在它自己的目录里，别处同时出现两个标志词的行必须点技能名；流程轴上的横切技能（crosscut）与阶段技能（stages）按同样的核法核各格与正文行数；常驻卡片点到全部模型与横切技能，每行末尾的技能名存在。
const CONTEXT_MAP = join(repo, "design", "context-map.json");
const MAP_CHECK = "上下文地图";
const MAP_KINDS = ["主", "行", "空"];
const hasText = (file, needle) => existsSync(join(repo, file)) && read(join(repo, file)).includes(needle);
function checkModelSkeleton(map, model) {
  const md = join(config.skillsDir, model.skill, "SKILL.md");
  if (!existsSync(md)) return fail(MAP_CHECK, `模型 ${model.skill} 没有 skills/${model.skill}/SKILL.md`);
  const text = read(md);
  if (!frontmatter(text)?.description?.startsWith("思维模型：")) fail(MAP_CHECK, `${rel(md)} 的 description 不以「思维模型：」领头`);
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, "").trim().split("\n");
  if (body.length > map.bodyMaxLines) fail(MAP_CHECK, `${rel(md)} 正文 ${body.length} 行，超过 ${map.bodyMaxLines} 行：细节挪到展开页`);
  for (const heading of map.skeleton) if (!body.includes(heading)) fail(MAP_CHECK, `${rel(md)} 缺「${heading}」一节`);
  for (const other of map.models) if (other !== model && !text.includes(`\`${other.skill}\``)) fail(MAP_CHECK, `${rel(md)} 的相邻模型没有点到 \`${other.skill}\``);
}
function checkMapCell(row, model, cell) {
  const at = `${row} × ${model.skill}`;
  if (!MAP_KINDS.includes(cell.kind)) return fail(MAP_CHECK, `${at}：kind「${cell.kind}」不是 ${MAP_KINDS.join("、")} 之一`);
  if (cell.kind !== "空" && !cell.files?.length) fail(MAP_CHECK, `${at}：标「${cell.kind}」却没有列 files`);
  if (cell.kind === "空" && !Object.keys(cell.slots ?? {}).length) fail(MAP_CHECK, `${at}：标「空」却没有列 slots`);
  const name = `\`${model.skill}\``;
  if (cell.kind === "主") for (const file of cell.files ?? []) { if (!hasText(file, name)) fail(MAP_CHECK, `${at}：${file} 没有点名 ${name}`); }
  else for (const file of cell.files ?? []) if (!hasText(file, model.hook)) fail(MAP_CHECK, `${at}：${file} 缺指路行「${model.hook}」`);
  for (const [file, slots] of Object.entries(cell.slots ?? {})) for (const slot of slots) if (!hasText(file, slot)) fail(MAP_CHECK, `${at}：${file} 缺空位「${slot}」`);
}
/** 复述：别处一行里出现模型的两个标志词，却既没点技能名，也不是指向「写代码的四条」的一行。指向四条的行是指针，四条那一节各句已指到所属模型。 */
function checkRestatement(model) {
  const own = join(config.skillsDir, model.skill) + "/";
  for (const file of walkMd(config.skillsDir)) {
    if (file.startsWith(own)) continue;
    read(file).split("\n").forEach((line, i) => {
      if (line.includes("写代码的四条")) return;
      if (model.marks.filter((mark) => line.includes(mark)).length >= 2 && !line.includes(`\`${model.skill}\``)) fail(MAP_CHECK, `${rel(file)}:${i + 1} 复述了「${model.name}」却没有点技能名 \`${model.skill}\``);
    });
  }
}
/** README.md 的矩阵表照地图生成：表头列出各模型的技能名，每行是环节名加各格的 kind，空白格留空。逐行核，缺哪行报哪行。 */
function checkReadmeMatrix(map) {
  const lines = [
    `| 环节 | ${map.models.map((m) => `\`${m.skill}\``).join(" | ")} |`,
    ...map.rows.map((r) => `| ${r.row} | ${map.models.map((m) => r.cells[m.skill]?.kind ?? "").join(" | ")} |`),
  ];
  for (const line of lines) if (!readme.split("\n").includes(line)) fail(MAP_CHECK, `README.md 的思维模型矩阵缺一行「${line}」：照 ${rel(CONTEXT_MAP)} 改`);
}
/** 流程轴上的横切技能（crosscut）与阶段技能（stages）：技能在、正文不超过上限，cells 的每一格按与模型同样的核法兑现。 */
function checkAxisSkill(item, maxLines, kind) {
  const md = join(config.skillsDir, item.skill, "SKILL.md");
  if (!existsSync(md)) return fail(MAP_CHECK, `${kind} ${item.skill} 没有 skills/${item.skill}/SKILL.md`);
  const body = read(md).replace(/^---\n[\s\S]*?\n---\n/, "").trim().split("\n");
  if (body.length > maxLines) fail(MAP_CHECK, `${rel(md)} 正文 ${body.length} 行，超过 ${maxLines} 行：细节挪到展开页`);
  for (const cell of item.cells ?? []) checkMapCell(cell.row, item, cell);
}
/** 常驻卡片：分隔线以下给项目原样放进常驻入口文件。它点到地图里每个思维模型与横切技能；每个列表项末尾是反引号括起的技能名，且技能存在。 */
function checkResidentCard(map) {
  if (!map.residentCard) return;
  if (!existsSync(join(repo, map.residentCard))) return fail(MAP_CHECK, `常驻卡片 ${map.residentCard} 不存在`);
  const card = read(join(repo, map.residentCard)).split("\n---\n").slice(-1)[0];
  for (const { skill } of [...map.models, ...(map.crosscut ?? [])]) if (!card.includes(`\`${skill}\``)) fail(MAP_CHECK, `常驻卡片 ${map.residentCard} 没有点到 \`${skill}\``);
  card.split("\n").forEach((line) => {
    if (!line.startsWith("- ")) return;
    const name = /`([a-z0-9-]+)`$/.exec(line.trimEnd())?.[1];
    if (!name) fail(MAP_CHECK, `常驻卡片 ${map.residentCard} 的「${line}」末尾不是技能名`);
    else if (!skills.includes(name)) fail(MAP_CHECK, `常驻卡片 ${map.residentCard} 的「${line}」末尾的 \`${name}\` 不是发行技能`);
  });
}
function checkContextMap() {
  let map;
  try {
    map = JSON.parse(read(CONTEXT_MAP));
  } catch (e) {
    return fail(MAP_CHECK, `读不了 ${rel(CONTEXT_MAP)}：${e.message}`);
  }
  const bySkill = new Map(map.models.map((m) => [m.skill, m]));
  for (const model of map.models) {
    checkModelSkeleton(map, model);
    if (model.marks?.length) checkRestatement(model);
  }
  for (const s of skills) if (s.startsWith("think-") && !bySkill.has(s)) fail(MAP_CHECK, `skills/${s} 不在 ${rel(CONTEXT_MAP)} 的 models 里`);
  checkReadmeMatrix(map);
  for (const entry of map.entries ?? []) for (const model of map.models) if (!hasText(entry, model.skill)) fail(MAP_CHECK, `${entry} 没有点到 ${model.skill}：从这个入口走不到这个思维模型`);
  for (const entry of map.entries ?? []) for (const item of map.crosscut ?? []) if (!hasText(entry, item.skill)) fail(MAP_CHECK, `${entry} 没有点到 ${item.skill}：从这个入口走不到这个横切技能`);
  for (const entry of map.entries ?? []) for (const item of map.stages ?? []) if (!hasText(entry, item.skill)) fail(MAP_CHECK, `${entry} 没有点到 ${item.skill}：从这个入口走不到这个阶段技能`);
  checkResidentCard(map);
  for (const row of map.rows) {
    for (const [skill, cell] of Object.entries(row.cells)) {
      const model = bySkill.get(skill);
      if (!model) fail(MAP_CHECK, `${row.row}：列了不在 models 里的 ${skill}`);
      else checkMapCell(row.row, model, cell);
    }
  }
  for (const item of map.crosscut ?? []) checkAxisSkill(item, map.bodyMaxLines, "横切技能");
  for (const item of map.stages ?? []) checkAxisSkill(item, map.stageMaxLines, "阶段技能");
}
checkContextMap();

// ---- 11. 连通性：单独读到一个技能时，正文里有回到上层的路。流程轴技能的正文开头有一行位置行，由 design/context-map.json 的 flow 生成：在流的哪一步、上一步、下一步、入口。上一步与下一步在地图里互逆。
const LINK_CHECK = "连通性";
const stepSkill = (ref) => (typeof ref === "string" ? ref : ref.skill);
const stepNames = (refs) => refs.map((ref) => `\`${stepSkill(ref)}\`${ref.when ? `（${ref.when}）` : ""}`).join("、") || "无";
/** 位置行。不在顺序链上的技能（没有上一步也没有下一步）只写位置与入口。 */
const positionLine = (flow, step) => {
  const chain = step.prev.length || step.next.length ? `上一步 ${stepNames(step.prev)}，下一步 ${stepNames(step.next)}。` : "";
  return `位置：${step.at}。${chain}顺序与例外见入口技能 \`${flow.entry}\`。`;
};
const skillBody = (md) => read(md).replace(/^---\n[\s\S]*?\n---\n/, "").trim().split("\n");
function checkFlowReciprocal(flow) {
  const bySkill = new Map(flow.steps.map((s) => [s.skill, s]));
  const has = (step, side, skill) => (step?.[side] ?? []).some((ref) => stepSkill(ref) === skill);
  for (const step of flow.steps) {
    for (const [side, other, sideName, otherName] of [["next", "prev", "下一步", "上一步"], ["prev", "next", "上一步", "下一步"]]) {
      for (const ref of step[side]) {
        const to = stepSkill(ref);
        if (!has(bySkill.get(to), other, step.skill)) fail(LINK_CHECK, `${rel(CONTEXT_MAP)} 的 flow 不互逆：${step.skill} 的${sideName}有 ${to}，${to} 的${otherName}没有 ${step.skill}`);
      }
    }
  }
}
function checkFlow(map) {
  const flow = map.flow;
  if (!flow?.steps?.length) return fail(LINK_CHECK, `${rel(CONTEXT_MAP)} 没有 flow：流程轴的位置行无处可核`);
  checkFlowReciprocal(flow);
  for (const step of flow.steps) {
    const md = join(config.skillsDir, step.skill, "SKILL.md");
    if (!existsSync(md)) {
      fail(LINK_CHECK, `流程轴技能 ${step.skill} 没有 skills/${step.skill}/SKILL.md`);
      continue;
    }
    const line = positionLine(flow, step);
    if (!skillBody(md).slice(0, flow.withinLines).includes(line)) fail(LINK_CHECK, `${rel(md)} 正文前 ${flow.withinLines} 行里缺位置行「${line}」`);
  }
}
function checkConnectivity() {
  let map;
  try {
    map = JSON.parse(read(CONTEXT_MAP));
  } catch {
    return; // 读不了地图已由「上下文地图」一项报过
  }
  checkFlow(map);
}
checkConnectivity();

// ---- 12. 接入约定：消费项目要跟着改的东西只有三样，槽位名、交接信息包的节、常驻卡片。
// design/consumer-contract.json 把它们列全并带一个整数 version；三样任何一样变了，这份文件就得跟着改，version 就得涨。
// 消费项目只钉 version：version 不变的发行版可以直接换用，不必改项目自己的文件。
const CONTRACT_CHECK = "接入约定";
const CONTRACT_PATH = "design/consumer-contract.json";
const TEACH_PATH = "skills/teach-pqw-skills/SKILL.md";
const HANDOFF_TEMPLATE_PATH = "skills/pass-the-baton/handoff-pack-template.md";
const CARD_PATH = "skills/single-session-dev-flow/resident-card.md";

/** 接入节的槽位名：教学技能里「| 槽位 | 谁用 |」表的第一列，去掉括号里的说明。 */
function liveSlots() {
  const lines = read(join(repo, TEACH_PATH)).split("\n");
  const head = lines.findIndex((l) => l.startsWith("| 槽位 | 谁用 |"));
  const names = [];
  for (let i = head + 2; head >= 0 && lines[i]?.startsWith("| "); i++) names.push(lines[i].split("|")[1].trim().split("（")[0].trim());
  return names;
}
/** 常驻卡片分隔线以下的部分，首尾空行去掉、末尾留一个换行：消费项目原样放进入口文件的就是这一段。 */
function liveCardSha() {
  const lines = read(join(repo, CARD_PATH)).split("\n");
  const body = `${lines.slice(lines.indexOf("---") + 1).join("\n").replace(/^\n+|\n+$/g, "")}\n`;
  return createHash("sha256").update(body).digest("hex");
}
const listDiff = (contract, live, liveName) => {
  const extra = contract.filter((x) => !live.includes(x)).map((x) => `「${x}」`).join("");
  const missing = live.filter((x) => !contract.includes(x)).map((x) => `「${x}」`).join("");
  if (!extra && !missing) return contract.join("\n") === live.join("\n") ? null : "顺序不同";
  return [extra && `约定里多${extra}`, missing && `${liveName}里多${missing}`].filter(Boolean).join("，");
};
/** 上一个带约定文件的发行 tag 与它的约定；不在 Git 仓库里或没有这样的 tag 时返回 null。 */
function previousContract() {
  const git = (...a) => spawnSync("git", ["-C", repo, ...a], { encoding: "utf8" });
  if (git("rev-parse", "--show-toplevel").status !== 0) return null;
  for (const tag of git("tag", "--list", "v*", "--sort=-v:refname").stdout.split("\n").filter(Boolean)) {
    const shown = git("show", `${tag}:${CONTRACT_PATH}`);
    if (shown.status === 0) return { tag, contract: JSON.parse(shown.stdout) };
  }
  return null;
}
function checkConsumerContract() {
  let contract;
  try {
    contract = JSON.parse(read(join(repo, CONTRACT_PATH)));
  } catch (e) {
    return fail(CONTRACT_CHECK, `读不了 ${CONTRACT_PATH}：${e.message}`);
  }
  const slots = listDiff(contract.slots ?? [], liveSlots(), "表");
  if (slots) fail(CONTRACT_CHECK, `${CONTRACT_PATH} 的 slots 与 ${TEACH_PATH} 的槽位表不一致：${slots}`);
  const headings = read(join(repo, HANDOFF_TEMPLATE_PATH)).split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3).trim());
  const sections = listDiff(contract.handoffSections ?? [], headings, "模板");
  if (sections) fail(CONTRACT_CHECK, `${CONTRACT_PATH} 的 handoffSections 与交接信息包模板的二级标题不一致：${sections}`);
  if (contract.residentCardSha256 !== liveCardSha()) fail(CONTRACT_CHECK, `${CONTRACT_PATH} 的 residentCardSha256 与常驻卡片的内容不一致`);
  if (!Number.isInteger(contract.version)) return fail(CONTRACT_CHECK, `${CONTRACT_PATH} 的 version 要是整数`);
  const previous = previousContract();
  if (!previous) return;
  const body = ({ version: _version, ...rest }) => JSON.stringify(rest);
  const same = body(contract) === body(previous.contract);
  if (!same && contract.version <= previous.contract.version) fail(CONTRACT_CHECK, `${CONTRACT_PATH} 的内容与 ${previous.tag} 不同，version 却没有涨（仍是 ${contract.version}）：消费项目要跟着改的变化必须涨 version`);
  if (same && contract.version !== previous.contract.version) fail(CONTRACT_CHECK, `${CONTRACT_PATH} 的内容与 ${previous.tag} 相同，version 却从 ${previous.contract.version} 变成 ${contract.version}：没有要消费项目跟着改的变化就不涨`);
}
checkConsumerContract();

// ---- 13. 发版说明：CHANGELOG 最新一节合模板，它「细节」之前的部分就是 GitHub Release 的正文。
// 只核最新一节：模板之前的旧节不回头改。
function checkReleaseNotes() {
  const CHECK = "发版说明";
  const text = read(join(repo, "CHANGELOG.md"));
  const first = text.split("\n").find((l) => l.startsWith("## "));
  const latest = releaseSections(text)[0];
  if (!latest || !latest.title || first !== `## ${latest.version} · ${latest.title}`) return fail(CHECK, "CHANGELOG.md 的第一节标题要写成「## <版本> · <一句标题>」");
  const where = `CHANGELOG.md 的 ${latest.version} 一节`;
  const pluginVersion = JSON.parse(read(config.pluginJson)).version;
  if (latest.version !== pluginVersion) fail(CHECK, `CHANGELOG.md 最新一节是 ${latest.version}，清单的版本是 ${pluginVersion}`);
  const body = releaseSummary(latest).split("\n");
  if (!/^[\x20-\x7E]+$/.test(body[0] ?? "")) fail(CHECK, `${where}：标题下第一段要是一句英文`);
  for (const lead of ["**要你动手的：**", "**接入约定：**"]) if (!body.some((l) => l.startsWith(lead))) fail(CHECK, `${where}：缺以「${lead}」开头的一行`);
  const changes = body.indexOf("### 变了什么");
  if (changes < 0 || !body.slice(changes + 1).some((l) => l.startsWith("- **"))) fail(CHECK, `${where}：「### 变了什么」下要有以「- **」开头的条目`);
}
checkReleaseNotes();

// ---- 输出

if (failures.length === 0) {
  if (!quiet) console.log(`PASS：${skills.length} 个发行技能，${metaSkills.length} 个元技能，${checkedFiles.length} 个文档，${codeFiles.length} 个脚本与网页。pstack ${pstackRoot ? basename(pstackRoot) : "缺"}，Matt ${mattRoot ? basename(mattRoot) : "缺"}。`);
  process.exit(0);
}
const byCheck = new Map();
for (const f of failures) byCheck.set(f.check, [...(byCheck.get(f.check) ?? []), f.message]);
for (const [check, messages] of byCheck) {
  console.log(`[${check}] ${messages.length} 项`);
  for (const m of messages) console.log(`  - ${m}`);
}
console.log(`FAIL：${failures.length} 项`);
process.exit(1);
