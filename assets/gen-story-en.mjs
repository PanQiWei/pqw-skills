// 从 assets/story.svg 生成英文版 assets/story-en.svg：逐条替换文字，换英文衬线字体。
// 改了 story.svg 之后重跑：node assets/gen-story-en.mjs。有没译到的中文会报错退出。
import { readFileSync, writeFileSync } from "node:fs";

const T = [
  ["pqw-skills 用一张图讲清：没有它时一程长活的结局，有它时同一程怎么走，以及你得到的六样东西", "pqw-skills in one picture: how a long run ends without it, how the same run goes with it, and the six things you get"],
  ["把一程长活，放心交给 agent", "Hand a long run to your agent, and trust it"],
  ["你定边界，它自己做完，你回来只验收。", "You set the boundaries. It finishes the work. You come back only to verify."],
  [">你</text>", ">you</text>"],
  [">第一幕<", ">ACT 1<"], [">第二幕<", ">ACT 2<"], [">第三幕<", ">ACT 3<"],
  ["没有它：一程长活常见的结局", "Without it: how a long run usually ends"],
  ["一句话就开工", "One-line kickoff"], ["需求没问清，", "The need is unclear;"], ["agent 边做边猜边界", "it guesses the scope"],
  ["做到一半偏了", "Drifts midway"], ["没人看见，", "Nobody is watching;"], ["越做越远", "it drifts further"],
  ["同一处修三遍", "Patch on patch"], ["补丁叠着补丁，", "Same spot, three fixes;"], ["没人回头看前提", "premise never checked"],
  ["报告写「全部完成」", "Says “all done”"], ["它自己说的，", "Its own word;"], ["没有证据", "no evidence"],
  ["你花一天返工", "A day of rework"], ["最贵的那一样，", "The costliest part"], ["是你的时间", "is your time"],
  [">偏离<", ">Drift<"], ["你离开得越久，它偏得越远，返工越贵", "the longer you are away, the further it drifts and the more rework costs"], ["返工成本", "Rework cost"],
  ["有它：同一程是这样走的", "With it: the same run goes like this"],
  ["你的注意力", "Attention"], ["在场，定边界", "Present, setting boundaries"], ["抽离，去做别的事", "Away, doing other things"], ["回来，验收", "Back, verifying"],
  ["定义期 · 你主导", "Definition · you lead"], ["六步，顺序不能跳", "six steps, in order"],
  ["1  需求与不变式", "1  Need &amp; invariants"], ["2  领域影响与边界", "2  Domain impact"], ["3  调研与复用", "3  Research &amp; reuse"],
  ["4  形式化守护", "4  Formal guard"], ["5  细化领域设计", "5  Detailed design"], ["6  正式落盘", "6  Docs landing"],
  ["每一步回答一个问题，产出是下一步的输入。", "Each step answers one question and feeds the next."],
  ["agent 会先问一遍：这个需求值不值得做。", "The agent first asks: is this worth building?"],
  [">交接期<", ">Relay<"], [">定约<", ">Commit<"], [">定程<", ">Size<"], [">交出<", ">Pass<"], [">一次<", ">one run<"], [">交一程<", ">at a time<"],  ["交付期 · agent 自主", "Delivery · agent runs it"], ["plan 把这一程切成片，每片走一圈：", "The plan cuts the run into slices; per slice:"],
  [">开工包<", ">Kickoff<"], [">做对<", ">Right<"], [">做好<", ">Well<"], [">收口<", ">Close<"], [">汇报<", ">Report<"], ["下一片", "next slice"],
  ["哨兵每 45 分钟从顶层回看", "A sentinel reviews every 45 min"], ["偏离、兜圈、上下文腐化，当场拉回", "Drift, loops, context rot: caught early"],
  ["完成只认证据：测试、读数、变异、逐条对照", "Done means evidence: tests, metrics, mutation"],
  ["你回来", "You return"], ["看汇报件", "Read report"], ["架构图、demo", "diagrams, demo"], ["上手验", "Try it"], ["每片几分钟", "minutes each"], [">收回<", ">Take back<"], ["验过再交下一程", "then next run"],
  ["你得到的六样", "Six things you get"],
  ["不白做", "No wasted work"], ["需求先过四问：有人在等吗、", "Four questions before work starts:"], ["今天怎么应付、谁用、最小做到哪。", "who needs it, how they cope today,"], ["它直言一次，然后听你的。", "the smallest cut. It says so once."],
  ["不猜边界", "No guessed scope"], ["动手前六步把不确定性消掉。", "Six steps remove uncertainty up front."], ["交出是物理条件：知识进了文档、", "The pass is a physical condition:"], ["过了评审，才算定好。", "written down and reviewed."],
  ["不乱想", "No loose thinking"], ["它带着六个想法做每件事：拆、", "Six habits in every task: decompose,"], ["找差异、定形、建、证、转手。", "find the gap, shape, build, prove,"], ["写在产出里，不靠它自觉。", "hand off. Written into the outputs."],
  ["不走偏", "No silent drift"], ["一个独立的哨兵定时回看，", "An independent sentinel reviews on a"], ["不让 agent 自己判自己。", "timer; the agent never grades itself."], ["偏了当场拉回，不等到早上。", "Drift is caught now, not at dawn."],
  ["不自夸", "No self-praise"], ["完成只认证据：测试先红后绿、", "Done means evidence: red-then-green"], ["结构读数、差分变异、逐条对照。", "tests, structure metrics, mutation,"], ["不认「我做完了」。", "line-by-line checks. Not “I'm done”."],
  ["不透支你", "No burnout for you"], ["一程多大，看你验得完多少。", "A run is sized by what you can verify."], ["超了它会建议分成几程。", "Too big? It proposes several runs."], ["夜里交活，有睡前交接与晨间交付。", "Nights: bedtime handoff, morning brief."],
  ["定义期六个技能", "six definition skills"],
  ["一次对照：同一个需求，只换技能版本", "One comparison: same request, only the skills differ"],
  ["需求是「给下载任务加暂停与继续」，让 agent 写切片开工包", "Request: “add pause and resume to a download task”; write the slice kickoff"],
  ["没有思维模型", "Without thinking models"], ["状态转移用文字列，非法情况一句带过", "Transitions in prose, gaps glossed"],
  ["有思维模型", "With thinking models"], ["6×5 全化表，30 格逐格有答复", "6×5 totality table, all 30 cells answered"],
  ["个技能", "skills"], ["个环节", "steps"], ["个思维模型", "thinking models"], ["个宿主可装", "hosts"],
  ['"TsangerJinKai02", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "STSong", Charter, Georgia, serif', 'Charter, "Iowan Old Style", Georgia, "Times New Roman", serif'],
];

let s = readFileSync(new URL("./story.svg", import.meta.url), "utf8");
// 长的先换，免得短词先把长句里的一段换掉。
for (const [zh, en] of [...T].sort((a, b) => b[0].length - a[0].length)) {
  if (!s.includes(zh)) { console.error("没找到：" + zh); process.exit(1); }
  s = s.split(zh).join(en);
}
const body = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
const left = body.match(/[一-鿿][^<"]*/g);
if (left) { console.error("还有没译的：" + [...new Set(left)].join(" | ")); process.exit(1); }
writeFileSync(new URL("./story-en.svg", import.meta.url), s);
console.log("story-en.svg ok");
