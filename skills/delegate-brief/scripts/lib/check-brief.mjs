// 核一份派发简报：模板的九节齐、目标节有角色行；评审者与验收者的简报要有「允许的动作」「不做的事」两小节，
// 对抗式的要求（找新反例、挑战设计、自写探针）只能写在「不做的事」里当禁令。只核结构与措辞，不核内容好坏。
// 新模板另有三栏：规格文件（文件要存在）、读量上限、报告行数上限（要有行数）。三栏有任一栏的是新模板，按缺陷核；
// 一栏都没有的是旧模板，只给提示。节名与栏名都与 ../brief-template.md 是同一份契约，用例把两处钉在一起。
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export const BRIEF_SECTIONS = ["1. 目标与指令", "2. 行动边界", "3. 必须遵守的规格", "4. 信息包", "5. 环境", "6. 模型与档位", "7. 验收清单", "8. 交回格式", "9. 追加记录"];
/** 评审只做确定性核对：这些说法把评审引去挑刺，写在「不做的事」以外就报。 */
export const ADVERSARIAL = ["找出新的反例", "找新的反例", "挑战设计", "自己写探针", "自写探针", "找问题", "挑刺", "对抗式评审", "对抗性评审"];
const REVIEWER_RE = /评审|验收/;
const REVIEWER_SUBSECTIONS = {
  允许的动作: "写明只读、只跑列出的命令",
  不做的事: "写明不自写探针或新用例去找反例、不提 spec 没写的标准",
};

/** 标题行的下标；没有返回 -1。 */
const indexOf = (lines, heading) => lines.findIndex((l) => l.trim() === heading);

/** 九节在不在、角色行在不在；评审者与验收者再核两小节。 */
function structureDefects(lines, role) {
  const missing = BRIEF_SECTIONS.filter((name) => indexOf(lines, `## ${name}`) < 0).map((name) => `缺节「## ${name}」`);
  if (!role) missing.push("目标与指令缺「- 角色：」一行");
  else if (REVIEWER_RE.test(role)) {
    for (const [name, hint] of Object.entries(REVIEWER_SUBSECTIONS)) if (indexOf(lines, `### ${name}`) < 0) missing.push(`评审者与验收者的简报缺「### ${name}」：${hint}`);
  }
  return missing.map((message) => ({ line: null, message }));
}

/** 「不做的事」小节以外出现的对抗式要求，每处一条。 */
function adversarialDefects(lines) {
  const from = indexOf(lines, "### 不做的事");
  const to = from < 0 ? -1 : lines.findIndex((l, i) => i > from && /^#{2,3} /.test(l));
  const inForbid = (i) => from >= 0 && i > from && (to < 0 || i < to);
  return lines.flatMap((l, i) => (inForbid(i) ? [] : ADVERSARIAL.filter((p) => l.includes(p)).map((p) => ({ line: i + 1, message: `对抗式要求「${p}」：评审只做确定性核对（spec、不变式、改动与读数），这类要求只能写在「不做的事」里当禁令` }))));
}

/** 新模板的三栏：规格写进文件、框住读量、报告限行。有任一栏的简报是新模板。 */
export const BRIEF_FIELDS = ["规格文件", "读量上限", "报告行数上限"];
const FIELD_HINTS = {
  规格文件: "写规格文件的路径，规格写在文件里，简报只指过去",
  读量上限: "写明先读什么、读到哪停，其余不读",
  报告行数上限: "写一个行数，例如「30 行」",
};
const OLD_TEMPLATE_HINT = `简报没有${BRIEF_FIELDS.map((f) => `「${f}」`).join("")}三栏，按旧模板核，这三栏只提示、不报缺陷。照简报模板加上它们：规格写进文件，框住读量，报告限行`;

/** 一栏所在的行下标与冒号后的值；没有这一栏返回 null。 */
function fieldOf(lines, name) {
  const i = lines.findIndex((l) => l.startsWith(`- ${name}：`));
  return i < 0 ? null : { i, value: lines[i].slice(name.length + 3).trim() };
}
/** 没填：空，或整条是尖括号占位。 */
const unfilled = (value) => value === "" || /^<[^>]*>$/.test(value);
/** 规格文件一栏里的路径：有反引号取第一对反引号里的，否则取第一个空白或中文标点之前的。 */
const specPath = (value) => /`([^`]+)`/.exec(value)?.[1] ?? value.split(/[\s（；，(]/)[0];

/** 一栏的值有什么问题；没有问题返回 null。 */
function fieldProblem(name, value, baseDirs) {
  if (name === "报告行数上限") return /\d+/.test(value) ? null : `「- ${name}：」没写行数：${FIELD_HINTS[name]}`;
  if (unfilled(value)) return `「- ${name}：」没填：${FIELD_HINTS[name]}`;
  if (name !== "规格文件") return null;
  const path = specPath(value);
  const found = isAbsolute(path) ? existsSync(path) : baseDirs.some((dir) => existsSync(resolve(dir, path)));
  return found ? null : `规格文件 ${path} 不存在：先把规格写进文件，再派`;
}

/** 新模板的三栏：缺哪栏报哪栏，在的栏核值。一栏都没有的旧模板不核，见 briefHints。 */
function fieldDefects(lines, baseDirs) {
  const fields = BRIEF_FIELDS.map((name) => [name, fieldOf(lines, name)]);
  if (fields.every(([, f]) => f === null)) return [];
  return fields.flatMap(([name, f]) => {
    if (f === null) return [{ line: null, message: `缺「- ${name}：」一栏：${FIELD_HINTS[name]}` }];
    const problem = fieldProblem(name, f.value, baseDirs);
    return problem ? [{ line: f.i + 1, message: problem }] : [];
  });
}

/**
 * 返回缺陷列表 [{ line, message }]，line 1 起，取不到时为 null。
 * baseDirs 是规格文件为相对路径时依次找的目录，缺省只找当前目录；命令面另加简报所在的目录。
 */
export function checkBrief(text, { baseDirs = [process.cwd()] } = {}) {
  const lines = text.split("\n");
  const role = /^- 角色：(.+)$/m.exec(text)?.[1];
  return [...structureDefects(lines, role), ...adversarialDefects(lines), ...fieldDefects(lines, baseDirs)];
}

/** 提示：不算缺陷、不改退出码。三栏一栏都没有的旧模板简报给一条，已有的简报不因模板升级而无故变红。 */
export function briefHints(text) {
  const lines = text.split("\n");
  return BRIEF_FIELDS.every((name) => fieldOf(lines, name) === null) ? [{ line: null, message: OLD_TEMPLATE_HINT }] : [];
}
