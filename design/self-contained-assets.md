# 本仓库要自带的模板、脚本与接入点

整理时间：2026-11-07。前提：pqw-skills 独立于 omne-harness-lite，指依赖方向：本仓库不读 omne 的文件、不依赖 omne 的命令；omne 以后直接采用它，反过来不行。所以这条流用到的技能正文、模板和脚本，凡是通用的，从 omne 迁过来自包含，再综合 pstack 与 Matt；凡是项目专有的，本仓库只定接入点，由消费者项目填。技能正文的迁移分类在 [skill-mapping.md](./skill-mapping.md)，本页只管模板、脚本与接入点。

## omne 现在提供了什么

下面是 omne-harness-lite 里这条流实际依赖的东西，按「通用还是项目专有」分开。通用的迁过来，专有的变成接入点。

| omne 里的东西 | 位置 | 通用还是专有 |
| --- | --- | --- |
| 代码评审的确定性三面 | `review-code/SKILL.md` | 通用，迁进 `slice-closeout`；命令与基线专有；「设计与实践」面不迁 |
| 文档评审的五类判据 | `review-docs/SKILL.md` | 通用，迁进 `formal-docs-landing`；检查命令专有 |
| 交付边界核对 | `review-delivery/SKILL.md` | 通用，迁进 `slice-closeout`；「任务卡」改为 spec |
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
| spec 模板 | `spec-and-plan` | 问题陈述、方案、依据与已定事项、原则与约束、跨域概念的五问、失败语义、实施决定、测试决定、待决、范围外。从 omne 的模板去掉项目概念。五问（本域为什么需要、谁拥有含义、采用哪种集成形态、各种状态怎样交接、换调用者什么不变）与失败语义表（正常、失败、未知、取消与清理、外部效果，各写行为、责任人、验证）都是项目无关的通用设计问题，保留；只去掉指向 omne 文档的出处 |
| plan 模板 | `spec-and-plan` | 进度总览、切片（每片端到端行为、验收、依赖）、顺序与并行、集中检查。从 omne 的模板去掉线与角色分配 |
| 上下文包模板 | `context-pack` | 整程包五节：不变式、系统地图、先读什么读到哪停、最容易踩的耦合、接入点；末尾主代理填关键设计与技术验证 |
| 切片开工包模板 | `context-pack` | 四节：上下文增量（绑定、依据、缺口）、技术细节设计与验证、细化的推进方案（有序步骤）、里程碑待办清单（可勾选、带完成判据）。写在 plan 的该切片之下 |
| 派发简报模板 | `delegate-brief` | 四要素各一节：目标与指令、边界（写范围、禁写、停点、完成即止）、规格、信息包；加模型与档位、交回格式。合并 omne 的任务信息包与闭包规格 |
| 回看记录模板 | `one-lesson-rule` | 哨兵汇报的固定字段：切片状态、子代理运行时长、停滞与反复信号；主代理的回看结论与动作 |
| 各宿主的接法说明 | `one-lesson-rule` | 每个宿主的定时机制、触发方式、汇报怎样到主代理、验证状态；Claude Code 的建法与后台循环的建法 |
| 收口清单 | `slice-closeout` | 顺序：类型检查与 lint、对照 spec 与不变式逐条核、结构读数、差分变异、去 slop、证明可用；每项的接入命令从项目接入点取 |
| 汇报件骨架 | `progress-artifacts` | Markdown 版：变了什么、架构层面（Mermaid）、读数、还缺什么、等你决定、体验六段；HTML 版与 demo 骨架归第二程 |
| 交付声明 | `cleanup` | 一程交付声明的固定字段，含一句「清了什么」；切片级只在收口记录写一句 |

## 本仓库自带的脚本

| 脚本 | 归哪个技能 | 做什么 | 备注 |
| --- | --- | --- | --- |
| `artifacts-dir` | `progress-artifacts` | 解析并创建 `<系统临时目录>/pqw-skills/<会话标识>/<一程标识>/artifacts/`，打印路径 | 用 Node 写，各宿主与三个操作系统一致 |
| 哨兵唤醒脚本 | `one-lesson-rule` | 按宿主选原生机制：Claude Code 用会话内的定时唤醒或 cron 工具；Codex 与 Cursor 没有原生定时时用后台脚本定时循环，到点写一个唤醒文件或发一条消息 | 每个宿主一份适配说明加一个脚本；绝不在循环里调用模型 |
| 清理脚本 | `cleanup` | 列出本程的子代理工作树与分支、临时目录，让人判断还要不要；删前要确认已合回 | 只做 Git 工作树、分支和临时目录三类，项目专有的产物由项目接入点声明 |
| `link-skills.sh` | 仓库根 | 本机软链进宿主技能目录 | 已有 |
| `check-repo.mjs` | 仓库根 | 仓库一致性检查：三处同步、引用可解析、无待写、无项目概念、无破折号、模板被链接 | 维护用，不发行 |

## 本仓库自带的工具：结构读数与差分变异

这两样在 omne 里是项目命令，本仓库改为自带可移植的工具，趁迁移把设计和实现一起完善。消费者只填范围与测试命令，不再自己实现。

### 结构读数

| 项 | 现状（omne） | 完善方向 |
| --- | --- | --- |
| 覆盖范围 | 只量 `packages/` 与 `apps/`，不量 `tools/` 与 `scripts/`；改动落在范围外时只能手算 | 范围由消费者配置声明，默认量仓库里全部 TypeScript；没有配置也能跑 |
| 基线 | 由 dev-flow `status` 的 `bound` 判定，和任务绑定耦合 | 基线只认一个 Git ref：显式 `--base`，缺省取与目标分支的合并点。不再有「绑定」概念 |
| 读数 | 圈复杂度与 CRAP，要 `--coverage` 才有 CRAP | 固定输出改动函数的圈复杂度、CRAP、认知复杂度三项；覆盖率从 lcov 读，没有 lcov 时 CRAP 标「无覆盖」而不是不算 |
| 输出 | 人读表 | 一份机读 JSON 加一份人读表，JSON 直接进汇报件 |
| 依赖图 | 与 `lint:deps` 共用 dependency-cruiser | 保留，但依赖违规和环的检查作为可选项，默认不跑 |

### 差分变异

| 项 | 现状（omne） | 完善方向 |
| --- | --- | --- |
| 范围 | 全量 93 分钟、CPU 只用一成、占测试名额；后来改为只打热点，靠人写 `--since` 与文件列表 | 热点选择内建：改动行所在的函数，加上判据、状态转移、并发与失败分支的文件，自动列出；`--plan-only` 先列范围 |
| 运行器 | Stryker 长寿运行器在负载下报「没跑测试」，要按精确位置用新运行器复跑再合并 | 「没跑测试」的变异自动按位置复跑一次再合并，结果里分清杀死、存活、无覆盖、未跑四类 |
| 进程数 | 靠 `VITEST_MAX_WORKERS` 手调，预算不足只打告警 | 按本机核数算默认预算，低于预算直接以配置启动，不用人重启 |
| 时间 | 没有上限 | 时间预算参数，超时按未跑报告，不默默跑到底 |
| 名额 | 依赖 omne 的测试名额脚本 | 不带名额机制。要串行化由消费者在外面包 |
| 输出 | 日志 | 机读 JSON 加人读表，存活变异带位置和建议 |

### 模板与汇报件一起完善

| 项 | 完善方向 |
| --- | --- |
| spec 模板 | 保留 omne 的失败语义与跨域概念五问；加「不变式对照」一节，每条不变式写它在本程由哪个测试或证明守 |
| plan 模板 | 进度总览改成机读表（切片、状态、head、收口读数），哨兵与汇报件直接读它；每个切片下面留切片开工包的四节，里程碑待办清单用可勾选的列表 |
| 汇报件 | 一份 HTML 骨架：进展（读 plan 的进度表）、架构变化（Mermaid 前后对照）、读数（结构读数与变异的 JSON）、还缺什么、待人决定。图表按统一的配色与暗色适配 |
| demo 骨架 | 单文件 HTML，可增量更新：每个切片追加一段，不重写整页 |

这四块已在第二程实现：`slice-closeout/scripts/metrics.mjs`、`mutation.mjs`（核心在 `lib/core.mjs`，TypeScript 适配器在 `lib/adapter-typescript.mjs`，模型在 `metrics-model.md`），`progress-artifacts/scripts/build-report.mjs` 与 `demo-append.mjs`。第三程把四个命令面的逻辑拆进 `lib/metrics.mjs`、`lib/mutation.mjs`、`lib/report.mjs`、`lib/demo.mjs`，命令面只剩参数、装载、信号与退出码；这样变异工具能打到工具自己的逻辑。

## 接入点：消费者项目要提供什么

本仓库不替项目决定命令和位置，只定一份接入清单。消费者在自己的 AGENTS.md 里写一节「pqw-skills 接入」，逐项填。技能正文里凡是写「从项目接入点取」的地方，读这一节。

| 槽位 | 谁用 | omne 现在的值 |
| --- | --- | --- |
| 类型检查与 lint 命令 | `slice-closeout` | `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps` |
| 结构读数的覆盖率文件、范围与带位线（工具自带） | `slice-closeout` | 工具由本仓库带；omne 填范围与 lcov 路径。现在是 `pnpm run metrics --coverage`，不量 `tools/` 与 `scripts/` |
| 差分变异的范围与点名文件（工具自带；多包仓库按成员 `--project`，用例导入构建产物的成员加 `--build-command`） | `slice-closeout` | 工具由本仓库带；omne 的根下没有 vitest 配置，按改动的成员各调一次 `--project`，成员有 `build` 脚本的加 `--build-command`。现在是 `pnpm run mutation`，基线由 dev-flow `status` 判定 |
| 文档检查命令 | `formal-docs-landing` | `pnpm run check:docs`、`check:design` |
| 三层正式文档的位置 | `formal-docs-landing` | 产品正文、`docs/`、各包 |
| 统一语言与领域对象的位置 | `requirement-and-invariants`、`domain-impact-analysis` | `.meta_harness/design/ubiquitous_language`、`domain_objects` |
| 形式化工具链与声明边界 | `formal-guard` | TLC 工具链、`docs/verification.md` |
| spec 与 plan 的项目模板 | `spec-and-plan` | `claim` 的 `references/`；没有时用本仓库自带的 |
| 项目专有的清理项 | `cleanup` | 项目 tmp 里本程的过程材料 |
| 子代理的模型与档位政策 | `delegate-brief` | `roles/dispatch-policy.json` |
| 交接信息包放哪 | `single-session-dev-flow` | 未提供；接管方案定为交付卡的正文 |

没有填的槽位，技能按「未提供」处理：跳过该步并在交付声明里写明，不猜命令。

## 本仓库不带也不要求的

| 东西 | 为什么 |
| --- | --- |
| issue tracker 与卡片流程 | 归消费者项目的交付规则 |
| 多会话的线、派发、集成、台账 | 本流不做多会话并行协作；两期分会话只是顺序交接，靠交接信息包 |
| 测试名额与准入 | 项目专有，而且是 omne 里要砍的候选 |
| 宿主适配的三份 `strategy.yaml` | omne 的生成器概念，本仓库直接以一份 `SKILL.md` 服务所有宿主；宿主差异只在哨兵脚本一处 |

## omne 采用本仓库时会被替代的

列出来只是为了以后那一步心里有数，这一轮不动 omne。

- `review-code`、`review-docs`、`review-delivery` 三份技能整个退役，由 `slice-closeout` 与 `formal-docs-landing` 替代；omne 只在接入节填命令、基线规则和文档位置。
- `claim` 的 spec、plan、context-map、task-pack、self-contained-check 五份模板，由本仓库的模板替代，omne 只保留卡号与绑定的附加节。
- `delegate` 的 closure-spec 与 writer-conventions 的通用半边，由 `delegate-brief` 替代；台账留在 omne。
- `asd-ste100` 与 `write-agents-md` 迁为本仓库的元技能后，omne 改为引用本仓库的版本。

## 已定的事

1. 接入点写在消费者 AGENTS.md 的一节「pqw-skills 接入」，不另立文件。
2. 三个脚本用 Node，各宿主与三个操作系统都有。
3. 「跨域概念的五问」与「失败语义」是通用设计问题，进本仓库的 spec 模板。
4. `clear-writing` 与 `write-agents-md` 作元技能放 `meta/skills/`，不发行。
