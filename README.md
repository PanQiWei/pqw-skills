# pqw-skills

我与 Claude Code、Codex、Cursor 等 coding agent 协作沉淀出的单会话研发流。它是一条控制回路：先在动手前把不确定性尽量消掉，再把执行放手给代理，再用固定节拍从顶层回看。人的注意力只花在定义边界和高层判断上，不花在逐行盯实现上。

仓库是扁平的：一个总入口技能，加上定义期与交付期各环节按需加载的技能。自定义的环节正文在这里，已有成熟做法的环节直接引用 pstack、ub-mode、mattpocock 的技能，不复制它们的正文。

## 什么时候用

这条流只为大改动而设。判据是影响范围：改动会触及领域边界、跨域协作或系统全局的架构时才走。

| 走这条流 | 不走这条流 |
| --- | --- |
| 复杂系统新增一个领域 | 小的缺陷修复 |
| 跨多个领域的功能纵线交付 | 快速原型，验证一个想法 |
| 子系统重构 | 小规模的增量接口设计与实现 |
| 较大规模的改造 | 一处局部修改，影响范围一眼看得清 |

不够格的工作整条流都不走，不走缩水版，直接按各自的技能做。

## 流的形状

```
人主导 ─────────────────────────────────────▶│◀───────────── 代理自主 ──────────────▶
                                              │
1 需求与不变式 → 2 领域影响与顶层设计            │  7 spec 与 plan → 8 前置消熵 → 切片 TDD
→ 3 技术调研与复用 → 4 形式化守护                │     → 9 派发 → 11 切片收口 → 12 向人汇报
→ 5 细化领域设计 → 6 正式落盘                   │            ▲                        │
                                              │            └── 10 每 45～60 分钟回看 ──┘
                                              │
                                   交接点：长期维护的知识已进唯一源并过评审
```

定义期由人主导，每一步回答一个问题、产出一样东西，并且是下一步的输入，顺序不能跳。交接点是物理条件：没进唯一源、没过评审的边界不算定好。到了交接点，人可以把注意力移开，由主代理自己上手或作为编排者自主推进交付。

## 技能

### 总入口

- **[single-session-dev-flow](./skills/single-session-dev-flow/SKILL.md)**：判断够不够格走这条流，定阶段、顺序、交接点，指出每个环节加载哪个技能。不写环节的做法。

### 定义期，人主导

| 环节 | 技能 | 回答的问题 | 引用 |
| --- | --- | --- | --- |
| 1 | [requirement-and-invariants](./skills/requirement-and-invariants/SKILL.md) | 给用户什么能力，系统前后有什么区别；系统永远要守住什么 | 无 |
| 2 | [domain-impact-analysis](./skills/domain-impact-analysis/SKILL.md) | 哪些领域受影响，要不要新领域，谁是重点谁是连带，全局怎么摆 | domain-modeling |
| 3 | [tech-research-and-reuse](./skills/tech-research-and-reuse/SKILL.md) | 有没有现成的库、相近系统或社区实现可复用，自造的论证是什么 | research |
| 4 | [formal-guard](./skills/formal-guard/SKILL.md) | 哪些性质靠测试守不住，要靠偏函数全化、数理建模与证明 | 无 |
| 5 | [detailed-domain-design](./skills/detailed-domain-design/SKILL.md) | 领域内部的对象、关系、仓储长什么样，I/O 与查询性能怎么定 | codebase-design |
| 6 | [formal-docs-landing](./skills/formal-docs-landing/SKILL.md) | 哪些要长期维护写正式文档，哪些以源码为文档，落在哪一层 | 无 |

### 交付期，代理自主

| 环节 | 技能 | 做什么 | 引用 |
| --- | --- | --- | --- |
| 7 | [spec-and-plan](./skills/spec-and-plan/SKILL.md) | 先写 spec 定目标、边界、验收标准，再写 plan 切成有序切片 | to-spec、to-tickets |
| 8 | [context-pack](./skills/context-pack/SKILL.md) | 整程开工前整理上下文包并做关键环节的细化设计与技术验证，每切片前增量补 | 无 |
| 9 | [delegate-brief](./skills/delegate-brief/SKILL.md) | 派子代理必须给齐目标、边界、规格、信息包四样东西 | poteto-mode |
| 10 | [one-lesson-rule](./skills/one-lesson-rule/SKILL.md) | 每 45 到 60 分钟从顶层回看一次，子代理每 30 分钟看一次健康度 | 无 |
| 11 | [slice-closeout](./skills/slice-closeout/SKILL.md) | 每切片收口：评审、圈复杂度与 CRAP 读数、差分变异、去 AI slop | code-review、deslop、ub-mode |
| 12 | [progress-artifacts](./skills/progress-artifacts/SKILL.md) | 用架构图、UML、快速 demo 等用完即弃的汇报件让人留在高层 | 无 |

实施本身走 TDD，不过度设计，不过度优化，由 `pstack:poteto-mode` 与 `pstack:tdd` 承载，本仓库不另写。

## 外部依赖

| 技能 | 来源 | 本机名 |
| --- | --- | --- |
| poteto-mode、tdd、deslop | [pstack](https://github.com/poteto/pstack) | `pstack:poteto-mode`、`pstack:tdd`、`pstack:deslop` |
| ub-mode | 独立技能 | `ub-mode` |
| to-spec、to-tickets、research、domain-modeling、codebase-design、code-review、prototype、diagnosing-bugs | [mattpocock/skills](https://github.com/mattpocock/skills) 1.3.1 | `mattpocock-skills:<name>` |

引用外部技能的环节只写本仓库的补充，正文里用「调用 Skill 工具加载 `<技能名>`」指向它们。版本与各宿主的加载方式在环节正文确认后钉死。

## 安装

作为 Claude Code 插件：

```bash
claude plugin marketplace add PanQiWei/pqw-skills
claude plugin install pqw-skills@pqw
```

本机开发时用软链接，拉取后即生效：

```bash
bash scripts/link-skills.sh
```

外部依赖要各自安装，本插件不打包它们。

## 仓库结构

见 [STRUCTURE.md](./STRUCTURE.md)。维护规则见 [AGENTS.md](./AGENTS.md)。

## 状态

0.0.0。十三个技能都有名字与触发描述，正文是要点与「待写」，逐环节确认后补全。
