#!/usr/bin/env node
// 仓库一致性检查。只读，纯 Node，无依赖。退出 0 全部通过；退出 1 有失败；退出 2 用法错误。
// 核的是 AGENTS.md 布局与写作规则里能机器化的那部分：三处同步、引用可解析、无待写、无项目概念、无破折号、模板被链接。

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

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

// ---- 4. 发行技能、模板、脚本与网页里的项目概念禁词、工作日志措辞。meta/skills/clear-writing 是原样引入的上游英文正文（attempt 是普通英文词），免检。
const self = fileURLToPath(import.meta.url);
const codeFiles = config.codeDirs.flatMap((d) => walkFiles(join(repo, d), config.codeExts)).filter((f) => f !== self);
for (const file of [...walkMd(config.skillsDir), ...walkMd(config.metaSkillsDir), ...codeFiles]) {
  if (file.includes("/meta/skills/clear-writing/")) continue;
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

// ---- 5. 全仓散文、脚本与网页无破折号。meta/skills/clear-writing 是原样引入的上游英文正文，免检。
for (const file of [...checkedFiles, ...codeFiles]) {
  if (file.includes("/meta/skills/clear-writing/")) continue;
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
  } catch (e) {
    fail("版本常量", e.message);
  }
}
checkToolVersion();

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
