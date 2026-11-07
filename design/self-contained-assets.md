# 本仓库要自带的模板、脚本与接入点

整理时间：2026-11-07。前提：pqw-skills 独立于 omne-harness-lite。omne-harness-lite 以后可以直接采用它，反过来不行。所以这条流用到的模板和脚本，凡是通用的，本仓库自己带；凡是项目专有的，本仓库只定接入点，由消费者项目填。

## 消费者现在提供了什么

下面是 omne-harness-lite 里这条流实际依赖的东西，按「通用还是项目专有」分开。它们是本清单的来源。

| omne 里的东西 | 位置 | 通用还是专有 |
| --- | --- | --- |
| spec 模板 | `claim/references/spec-template.md` | 通用，但混了卡号、attempt、跨域五问等项目概念 |
| plan 模板 | `claim/references/plan-template.md` | 通用，但混了线、角色模型分配、交回清单等项目概念 |
| 上下文地图与本卡附录 | `claim/references/context-map.md` | 通用，但以线为单位 |
| 任务信息包（派发简报） | `claim/references/task-pack.md` | 通用，七节正好覆盖四要素 |
| 闭包规格 | `delegate/references/closure-spec.md` | 通用 |
| 写者共用约定 | `delegate/references/writer-conventions.md` | 一半通用（门禁、产物位置、交回格式），一半专有（名额、不跑的检查） |
| 自包含检查 | `claim/references/self-contained-check.md` | 通用 |
| 派发台账与脚本 | `delegate/references/ledger.md`、`scripts/ledger.py` | 专有，多会话与里程碑口径 |
| 结构读数与差分变异 | `pnpm run metrics`、`pnpm run mutation`，基线由 dev-flow 判定 | 专有命令，通用需求 |
| 文档评审 | `review-docs` 加 `pnpm run check:docs`、`check:design` | 专有命令，通用需求 |
| 类型检查与 lint | `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps` | 专有 |
| 测试名额 | `scripts/with-test-slot.sh` | 专有，且是要砍的候选 |
| 形式化工具链 | TLC、`docs/verification.md` 的声明边界 | 工具链专有，触发与证真证伪分工通用 |
| 三层正式文档的位置 | 产品正文在 `.meta_harness/design`，顶层在 `docs/`，领域包组在各包 | 专有 |

## 本仓库自带的模板

放在各环节技能目录下，由 `SKILL.md` 链接。模板只含流本身要求的节，不含任何项目概念（卡号、线、attempt、轨道）。

| 模板 | 归哪个技能 | 内容 |
| --- | --- | --- |
| 需求与不变式单 | `requirement-and-invariants` | 用户可见差异三问；不变式清单，每条带「违反时的后果」与「谁守」 |
| 领域影响分级表 | `domain-impact-analysis` | 现有领域逐个标重点、次要、连带或不受影响；新领域候选及理由；顶层设计的一段话加一张图 |
| 复用论证单 | `tech-research-and-reuse` | 候选清单、直接复用或二次开发或自造的结论、自造的论证 |
| 形式化触发建议单 | `formal-guard` | 命中的触发类别、要守的性质、建议的工具、预估成本、人确认栏；证明到契约测试的转换清单 |
| 细化设计清单 | `detailed-domain-design` | 领域模型、关系模型、仓储设计三节；仓储一节固定问写入路径、查询路径、I/O 形态、容量假设 |
| 落盘决定表 | `formal-docs-landing` | 每项设计产出标「正式文档」或「以源码为文档」及判据，落在哪一层 |
| 交接点核对单 | `single-session-dev-flow` | 长期知识是否进唯一源、是否过评审、形式化件是否落盘并验证 |
| spec 模板 | `spec-and-plan` | 问题陈述、方案、依据与已定事项、原则与约束、失败语义、实施决定、测试决定、待决、范围外。从 omne 的模板去掉项目概念 |
| plan 模板 | `spec-and-plan` | 进度总览、切片（每片端到端行为、验收、依赖）、顺序与并行、集中检查。从 omne 的模板去掉线与角色分配 |
| 上下文包模板 | `context-pack` | 整程包：不变量、系统地图、先读什么读到哪停、最容易踩的耦合；切片增量：绑定、依据、缺口 |
| 派发简报模板 | `delegate-brief` | 四要素各一节：目标与指令、边界（写范围、禁写、停点、完成即止）、规格、信息包；加模型与档位、交回格式。合并 omne 的任务信息包与闭包规格 |
| 回看记录模板 | `one-lesson-rule` | 哨兵汇报的固定字段：切片状态、子代理运行时长、停滞与反复信号；主代理的回看结论与动作 |
| 收口清单 | `slice-closeout` | 顺序：评审、结构读数、差分变异、去 slop、证明可用；每项的接入命令从项目接入点取 |
| 汇报件骨架 | `progress-artifacts` | Mermaid 架构图与 UML 的最小骨架；单文件 HTML demo 的最小骨架；「变了什么、还缺什么」的固定段 |
| 清理清单与交付声明 | `cleanup` | 切片级与一程级的清单；一程交付声明的固定字段，含清理已做 |

## 本仓库自带的脚本

| 脚本 | 归哪个技能 | 做什么 | 备注 |
| --- | --- | --- | --- |
| `artifacts-dir` | `progress-artifacts` | 解析并创建 `<系统临时目录>/pqw-skills/<会话标识>/<一程标识>/artifacts/`，打印路径 | 用各宿主都有的运行时写，Node 或 Python 二选一，三个操作系统一致 |
| 哨兵唤醒脚本 | `one-lesson-rule` | 按宿主选原生机制：Claude Code 用会话内的定时唤醒或 cron 工具；Codex 与 Cursor 没有原生定时时用后台脚本定时循环，到点写一个唤醒文件或发一条消息 | 每个宿主一份适配说明加一个脚本；绝不在循环里调用模型 |
| 清理脚本 | `cleanup` | 列出本程的子代理工作树与分支、临时目录；先列后删，删前要确认已合回 | 只做 Git 工作树、分支和临时目录三类，项目专有的产物由项目接入点声明 |
| `link-skills.sh` | 仓库根 | 本机软链进宿主技能目录 | 已有 |

## 接入点：消费者项目要提供什么

本仓库不替项目决定命令和位置，只定一份接入清单。消费者在自己的代理入口文件（AGENTS.md 或 CLAUDE.md）里写一节「pqw-skills 接入」，逐项填。技能正文里凡是写「从项目接入点取」的地方，读这一节。

| 槽位 | 谁用 | omne 现在的值 |
| --- | --- | --- |
| 类型检查与 lint 命令 | `slice-closeout` | `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps` |
| 结构读数命令与度量范围 | `slice-closeout` | `pnpm run metrics --coverage`，不量 `tools/` 与 `scripts/` |
| 差分变异命令与基线规则 | `slice-closeout` | `pnpm run mutation`，基线由 dev-flow `status` 判定 |
| 文档检查命令 | `formal-docs-landing` | `pnpm run check:docs`、`check:design` |
| 文档评审流程 | `formal-docs-landing` | `review-docs` 技能 |
| 三层正式文档的位置 | `formal-docs-landing` | 产品正文、`docs/`、各包 |
| 统一语言与领域对象的位置 | `requirement-and-invariants`、`domain-impact-analysis` | `.meta_harness/design/ubiquitous_language`、`domain_objects` |
| 形式化工具链与声明边界 | `formal-guard` | TLC 工具链、`docs/verification.md` |
| spec 与 plan 的项目模板 | `spec-and-plan` | `claim` 的 `references/`；没有时用本仓库自带的 |
| 项目专有的清理项 | `cleanup` | 项目 tmp 里本程的过程材料 |
| 子代理的模型与档位政策 | `delegate-brief` | `roles/dispatch-policy.json` |

没有填的槽位，技能按「未提供」处理：跳过该步并在交付声明里写明，不猜命令。

## 本仓库不带也不要求的

| 东西 | 为什么 |
| --- | --- |
| issue tracker 与卡片流程 | 归消费者项目的交付规则 |
| 多会话的线、派发、集成、台账 | 本流只做单会话 |
| 测试名额与准入 | 项目专有，而且是 omne 里要砍的候选 |
| 宿主适配的三份 `strategy.yaml` | omne 的生成器概念，本仓库直接以一份 `SKILL.md` 服务所有宿主；宿主差异只在哨兵脚本一处 |

## omne 采用本仓库时会被替代的

列出来只是为了以后那一步心里有数，这一轮不动 omne。

- `claim` 的 spec、plan、context-map、task-pack、self-contained-check 五份模板，由本仓库的模板替代，omne 只保留卡号与绑定的附加节。
- `delegate` 的 closure-spec 与 writer-conventions 的通用半边，由 `delegate-brief` 替代；台账留在 omne。
- `review-code` 的流程骨架由 `slice-closeout` 替代，命令与基线规则留在 omne 作接入点的值。

## 要你拍板的

1. **接入点的载体。** 写在消费者 AGENTS.md 的一节，还是一个独立的 `pqw-skills.md` 文件。前者少一个文件，后者机读更稳。
2. **脚本的语言。** 三个脚本用 Node 还是 Python。omne 两者都有；一般项目 Node 更常见。
3. **omne 专有模板里哪些节要保留成通用的。** 比如「跨域概念的五问」和「失败语义」是 omne 的 spec 模板里的，我觉得它们其实通用，建议进本仓库的 spec 模板。
