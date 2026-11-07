# 环节与技能的映射

整理时间：2026-11-07。回答三个问题：每个环节引用什么外部技能，哪些环节自己写，自己写的技能里再引用哪些现成技能。末尾列不引用的外部技能和它们被排除的理由，以及要你拍板的事。

## 盘点结论

| 来源 | 本机装的 | 上游最新 | 对本仓库的影响 |
| --- | --- | --- | --- |
| pstack（michael-denyer/pstack-claude 移植版） | 0.9.79 | 0.9.132，头 df9bc05b8，2026-11-06 | 形式化相关的技能全在新版本：`create-formal-verification-skill`、`maintain-formal-verification-skill`、`statechart`。另有 `ketchup`、`sharpen`、`in-your-own-words`、`thermos`、`thermo-nuclear-review` 也是新的。本仓库必须钉 0.9.132 或更新 |
| mattpocock/skills | 1.3.1 | 1.3.2 | 1.3.2 只是补丁，1.3.1 够用 |
| ub-mode | 提交 57a8bdd | 同 | 不变 |

一条硬约束：Matt 的 `to-spec`、`to-tickets`、`implement`、`grill-with-docs` 声明了 `disable-model-invocation: true`，宿主不让模型通过 Skill 工具调用它们。omne-harness-lite 的做法是按已安装路径直接读正文，并在报告里写明读取方式。本仓库沿用这个做法，写进引用它们的环节技能里。pstack 的技能没有这个限制。

## 三种定性

- **引用为主**：外部技能已经把做法写全，本仓库只写它在流里的位置、顺序和本流的补充规则。
- **自写为主**：外部没有对应的技能，或者外部技能的边界和我们不同。正文在本仓库。
- **自写加辅助引用**：主体自写，局部步骤指向外部技能。

## 逐环节映射

| 环节 | 技能 | 定性 | 主引用 | 辅助引用 | 自写的内容 |
| --- | --- | --- | --- | --- | --- |
| 入口 | `single-session-dev-flow` | 自写 | 无 | `pstack:poteto-mode`（整条流的执行风格） | 适用范围、阶段与顺序、交接点、规则、路由表 |
| 1 | `requirement-and-invariants` | 自写加辅助 | 无 | `pstack:in-your-own-words`（代理先复述目标与问题）、`mattpocock-skills:grilling`（追问到不变式） | 需求的三问（能力、前后差异、谁受益）、不变式清单的格式与判据、什么算不变式什么不算 |
| 2 | `domain-impact-analysis` | 自写加辅助 | `mattpocock-skills:domain-modeling` | `pstack:principle-model-the-domain`、`pstack:blast-radius`（既有领域的消费者普查，判连带范围） | 重点、次要、连带的分级判据；要不要新领域的判据；顶层粗粒度设计的最小产出 |
| 3 | `tech-research-and-reuse` | 引用为主 | `mattpocock-skills:research` | `pstack:principle-subtract-before-you-add` | 复用优先的次序（直接复用、二次开发、二次封装、自造）、自造论证的格式 |
| 4 | `formal-guard` | 自写加辅助 | `pstack:create-formal-verification-skill`（选工具、生成项目内验证技能、先证明能失败） | `pstack:statechart`（TLA+ 结果读图）、`pstack:maintain-formal-verification-skill`（代码变后同步模型） | 四类触发条件、代理建议人确认、证真证伪的分工、偏函数定义与全化的写法、形式化结论转契约测试的清单 |
| 5 | `detailed-domain-design` | 自写加辅助 | `mattpocock-skills:codebase-design`（深模块与接口） | `pstack:architect`（类型、签名、模块结构先于代码）、`pstack:principle-type-system-discipline`、`pstack:principle-boundary-discipline` | DDD、SOLID、仓储三件事怎样结合；仓储设计单列的清单：写入路径、查询路径、I/O 形态、容量假设 |
| 6 | `formal-docs-landing` | 自写加辅助 | 无 | `pstack:technical-writing`（写法）、`mattpocock-skills:writing-for-agents`（写给代理读的部分） | 落盘判据（读代码效率是否低于读文档）、三层位置、形式化件的落盘要求、文档评审的接入点 |
| 交接点 | 入口技能里 | 自写 | 无 | 无 | 物理条件的核对清单 |
| 7 | `spec-and-plan` | 引用为主 | `mattpocock-skills:to-spec`、`mattpocock-skills:to-tickets`（按已安装路径读正文） | `pstack:sharpen`（把任务做深不做大） | 先 spec 后 plan 的顺序；本仓库自带的 spec 与 plan 模板；项目有模板时以项目为准 |
| 8 | `context-pack` | 自写加辅助 | 无 | `pstack:principle-guard-the-context-window`、`pstack:recall`（压缩后重建上下文）、`mattpocock-skills:prototype`（技术验证用抛弃式原型） | 整程包与切片增量包的内容清单、派便宜子代理整理的简报、一次整理之后只增补 |
| 9 | `delegate-brief` | 自写加辅助 | `pstack:poteto-mode`（子代理章节） | `pstack:swarm`（并行扇出的收口方式）、`pstack:principle-separate-before-serializing-shared-state`（写范围不相交） | 四要素的模板与核对、模型与推理档位的选法、交回格式 |
| 10 | `one-lesson-rule` | 自写加辅助 | 无 | `pstack:show-me-your-work`（决策日志，哨兵醒来先读它）、`pstack:recall` | 哨兵机制、各宿主原生定时机制清单、唤醒脚本、回看清单、常规出口 |
| 执行 | 不单设技能 | 引用 | `mattpocock-skills:tdd`（seam、mocking、好测试的判据） | `pstack:typescript-best-practices`、`ub-mode` | 入口技能里一句：实施走 TDD，不过度设计 |
| 11 | `slice-closeout` | 自写加辅助 | `mattpocock-skills:code-review` | `pstack:thermos`（深度评审，高风险切片用）、`pstack:deslop`、`pstack:unslop`、`pstack:blast-radius`、`pstack:principle-prove-it-works`、`ub-mode` | 收口清单的顺序；圈复杂度、CRAP、差分变异的接入点（命令归消费者项目）；两轮不收敛就升级的阶梯 |
| 12 | `progress-artifacts` | 自写加辅助 | 无 | `pstack:ketchup`（追进度的讲法：说变化，不说过程）、`mattpocock-skills:prototype`（demo 的做法：单文件 HTML） | 汇报件的三种形式、放置位置、用完即弃 |
| 13 | `cleanup` | 自写 | 无 | 无 | 两个尺度的清理清单、删前核对、交付声明含清理 |

## 不引用的外部技能

| 技能 | 为什么不引用 |
| --- | --- |
| `mattpocock-skills:implement`、`implement-spec` | 它们是整段交付的替代流，和本流的切片推进、收口、哨兵、清理重叠。引用会出现两套交付期 |
| `mattpocock-skills:wayfinder` | 为超过一个会话的工作设计，本流只做单会话 |
| `mattpocock-skills:triage`、`setup-matt-pocock-skills`、`pr` | 绑定 issue tracker 与 PR 流程，归消费者项目的交付规则 |
| `mattpocock-skills:grill-with-docs` | 按 Matt 的 GLOSSARY 与 ADR 布局写文档；消费者项目有自己的文档层，用 `grilling` 加本仓库的落盘环节代替 |
| `pstack:figure-it-out` | 它是「没有 playbook 时设计 playbook」，本流就是 playbook |
| `pstack:arena`、`babysit`、`fix-ci`、`fix-merge-conflicts`、`make-pr-easy-to-review` | 工具性技能，由代理在需要时自行用，不进流 |
| `pstack:tdd` | 它的触发条件是「用户明确要求 TDD 时」，比 Matt 的 `tdd` 窄；本流固定走 TDD，用 Matt 的做方法参考 |
| `pstack:automate-me`、`reflect`、`correct` | 维护技能仓库本身时用，不进交付流 |

## 版本钉法

- pstack 钉移植版 0.9.132 或更新，提交 df9bc05b8。消费者项目当前钉 0.9.79，采用本仓库时要同步升级。
- mattpocock/skills 钉 1.3.1，提交 b0618bc。
- ub-mode 钉提交 57a8bdd。

## 要你拍板的

1. **到交付期执行的切片推进，要不要一个独立技能。** 现在是入口技能一句话加 Matt 的 `tdd`。我倾向不单设，因为 `poteto-mode` 加 `tdd` 已经够，再设一个就是复制。
2. **`slice-closeout` 的深度评审默认用哪个。** Matt 的 `code-review` 轻，pstack 的 `thermos` 重且派两个子代理。我倾向默认 `code-review`，形式化守护过的切片或触及不变式的切片才用 `thermos`。
3. **`to-spec` 与 `to-tickets` 的读法。** 沿用 omne 的「按已安装路径直接读正文」，还是本仓库自带一份精简的 spec 与 plan 写法、不再依赖它们。前者少维护，后者少一个用户触发限制带来的坑。
