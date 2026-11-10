// 核一份派发简报：模板的九节齐、目标节有角色行；评审者与验收者的简报要有「允许的动作」「不做的事」两小节，
// 对抗式的要求（找新反例、挑战设计、自写探针）只能写在「不做的事」里当禁令。只核结构与措辞，不核内容好坏。
// 节名与 ../brief-template.md 是同一份契约，用例把两处钉在一起。

export const BRIEF_SECTIONS = ["1. 目标与指令", "2. 行动边界", "3. 必须遵守的规格", "4. 信息包", "5. 环境", "6. 模型与档位", "7. 验收清单", "8. 交回格式", "9. 追加记录"];
/** 评审只做确定性核对：这些说法把评审引去挑刺，写在「不做的事」以外就报。 */
export const ADVERSARIAL = ["找出新的反例", "找新的反例", "挑战设计", "自己写探针", "自写探针", "找问题", "挑刺", "对抗式评审", "对抗性评审"];
const REVIEWER_RE = /评审|验收/;

/** 返回缺陷列表 [{ line, message }]，line 1 起，取不到时为 null。 */
export function checkBrief(text) {
  const lines = text.split("\n");
  const defects = [];
  const at = (pred) => { const i = lines.findIndex(pred); return i < 0 ? null : i; };
  for (const name of BRIEF_SECTIONS) if (at((l) => l.trim() === `## ${name}`) === null) defects.push({ line: null, message: `缺节「## ${name}」` });
  const role = /^- 角色：(.+)$/m.exec(text)?.[1];
  if (!role) defects.push({ line: null, message: "目标与指令缺「- 角色：」一行" });
  const sub = (name) => at((l) => l.trim() === `### ${name}`);
  if (role && REVIEWER_RE.test(role)) {
    if (sub("允许的动作") === null) defects.push({ line: null, message: "评审者与验收者的简报缺「### 允许的动作」：写明只读、只跑列出的命令" });
    if (sub("不做的事") === null) defects.push({ line: null, message: "评审者与验收者的简报缺「### 不做的事」：写明不自写探针或新用例去找反例、不提 spec 没写的标准" });
  }
  const forbidStart = sub("不做的事");
  const forbidEnd = forbidStart === null ? null : lines.findIndex((l, i) => i > forbidStart && /^#{2,3} /.test(l));
  lines.forEach((l, i) => {
    if (forbidStart !== null && i > forbidStart && (forbidEnd < 0 || i < forbidEnd)) return;
    for (const phrase of ADVERSARIAL) if (l.includes(phrase)) defects.push({ line: i + 1, message: `对抗式要求「${phrase}」：评审只做确定性核对（spec、不变式、改动与读数），这类要求只能写在「不做的事」里当禁令` });
  });
  return defects;
}
