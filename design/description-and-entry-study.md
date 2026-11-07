# 从 pstack 与 mattpocock/skills 学 description 与入口的写法

整理时间：2026-11-07。读的是本机钉定版本：pstack 0.9.132 全部 64 个技能的 frontmatter、`poteto-mode`、`poteto-help`、`teach`、`poteto-help/references/prompting.md`；Matt 1.3.2 全部 42 个技能的 frontmatter、`ask-matt`、`teach`、`writing-for-agents` 与 `SKILL-MECHANICS.md`。结论已落到本仓库的 15 条 description、入口技能与 `teach-pqw-skills`。

## description 的规律

两家的 description 都是「上下文指针」：它一直在模型上下文里，每个字每回合都付钱，所以只放能改变「要不要加载」这个判断的词。

| 规律 | pstack 的写法 | Matt 的写法 | 本仓库采用 |
| --- | --- | --- | --- |
| 领头词先行 | 动词开头说做什么：`Sketch types, signatures...`、`Find what a change could break...` | 名词短语开头：`Shared vocabulary for designing deep modules.` | 环节号与环节名开头：`定义期第 4 步，形式化守护：` |
| 系列共用一种语法 | 24 个 principle 一律 `Apply` 领头：18 个 `Apply when <情形>. <一句规则>.`，其余 `Apply to / before / after / during <情形>.` | engineering 系列多为 `<做什么>. Use when the user ...` | 定义期六条共用「定义期第 N 步，<名>：<做什么>。<前置产出就绪>或人说「……」时加载。<一条不加载>。」；交付期七条同构 |
| 触发写人会说的原话 | `Use for /architect, 'architect this', 'design this'` | `mentions "red-green-refactor"`、`says "diagnose"/"debug this"` | 每条带两到三句人会说的中文原话，加 `/<name>` 点名 |
| 一个分支只写一次 | 同义触发合并 | `writing-for-agents`：synonyms that rename a single branch are one branch written twice | 不加载只写最容易误触的那一个分支 |
| 相邻技能互指 | `why` 末尾 `Use how for runtime behavior`；`tdd` 写 `Skip when ...` | `grill-me` 与 `grill-with-docs` 互相说明何时用谁 | 容易混的两条在 description 末尾一句指过去，例如 `context-pack` 指 `spec-and-plan` |
| 长度 | 多数一到三句，25 到 60 个英文词 | 多数一到两句 | 中文 100 到 180 字；把方法细节留给正文，把字数花在触发原话与互指上 |
| 只许人触发的技能 | 无 | `ask-matt`、`teach`、`to-spec`、`to-tickets` 用 `disable-model-invocation: true`，description 变成给人看的一句话 | 本仓库全部模型可触发，交付期靠主代理自己加载；`teach-pqw-skills` 也模型可触发，因为人会用自然语言问 |

两家都不在 description 里写方法本身的细节。本仓库原来的 description 把六步做法压缩进去了，这部分是正文该承担的，删掉后 description 从平均 150 字降到 110 字左右，触发条件反而更清楚。

## 入口技能的两种形态

| | pstack `poteto-mode` | Matt `ask-matt` | 本仓库 |
| --- | --- | --- | --- |
| 给谁读 | 模型。模型可触发，是执行入口 | 人。`disable-model-invocation`，是路由图 | 模型，是执行入口；人读的路由图归 `teach-pqw-skills` |
| 结构 | 不可商量的触发 → 原则索引 → 自主边界 → 子代理默认 → 回复写法 → playbook 列表 | 主流 → 上匝道 → 健康 → 词汇层 → 阶段边界 → 独立技能 → 前提 | 够不够格 → 开工动作 → 阶段表 → 怎样走 → 不可商量的 → 容易混的 |
| 让流可审计的机制 | 把 playbook 的步骤原样抄进任务清单，不做的步骤留 `skip: <reason>` | 无；靠人记 | 采用：加载入口时把 13 个环节写进会话任务清单，跳过的留「跳过：<理由>」 |
| 开场 | 第一条回复用自己的话复述目标与问题，不等确认 | 从 `/grill-with-docs` 访谈开始 | 采用 pstack 的复述；访谈归第 1 步 `requirement-and-invariants` |
| 换题 | 「new task」重新匹配 playbook | 无 | 采用：人说「新任务」或提出另一个需求，重新过适用范围 |
| 容易混的 | `poteto-help` 的 Close calls 小节 | 正文里成对说明 | 入口末尾加「容易混的环节」五条 |
| 厚度 | 很厚，含模型表与效果等级 | 中等，叙述体 | 保持薄：入口只定阶段、顺序、交接点、路由；规则按主题分组 |

没有采用的：pstack 的模型与效果等级表（本仓库把模型政策交给项目接入点）；pstack 的 principle 索引（研发品味整体引用 ub-mode，不拆成单条技能）；Matt 的 issue tracker 前提（本流不要求卡片系统）。

## 教人的技能

pstack 的 `poteto-help` 是帮助台：先判断是提问还是要干活，提问就回答、给一条可直接发的示例提示、指出答案来自哪个文件，不替人开工；分五类需求用单选问清；有「跑偏了怎么办」的症状表；提示写法单独一页。pstack 的 `teach` 定了教法：先给最小完整的答案再停下，讲机制不讲比喻，三个以上部分的东西分几张图逐步画，不出测验、不说「这里很重要」。Matt 的 `teach` 是跨会话的学习工作区，太重，只借它的一点：先弄清人为什么要学、正在做什么，教到他的任务上去。

`teach-pqw-skills` 按这三样合成：帮助台的结构、pstack 的教法、从人的任务出发。它自带三份参考：心智模型与哲学、每个环节人和代理各做什么、第一条提示怎么写与一行纠偏。
