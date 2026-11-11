# 仓库目录结构说明

```
pqw-skills/
├── README.md                 人读的入口：安装方式、技能表、外部依赖表
├── README_EN.md              README 的英文版，技能表与安装路线同步
├── AGENTS.md                 代理读的入口：布局规则与维护规则
├── CLAUDE.md                 只有一行 @AGENTS.md，Claude Code 由此读到 AGENTS.md
├── STRUCTURE.md              本文件
├── CHANGELOG.md              每次改技能行为记一条
├── CONTRIBUTING.md           参与方式：改动理由、改哪一层、开 PR 前的检查
├── DEVELOPMENT.md            本机开发：链接、检查、跑脚本、升级钉定版本、发版
├── SECURITY.md               安全问题的报告渠道与范围
├── CODE_OF_CONDUCT.md        行为准则
├── LICENSE                   MIT
├── .gitignore
├── .github/                  PR 模板与 issue 模板
├── assets/
│   └── flow.svg              README 里的流程图，手写 SVG，带深色模式样式
├── .claude-plugin/
│   ├── plugin.json           插件清单：名字、版本、skills 数组逐个列出技能目录
│   └── marketplace.json      仓库自带的单插件市场，供 claude plugin marketplace add
├── design/                   设计文档：环节映射、自带资产与接入点、吸收的外部经验；context-map.json 是上下文地图（流程轴乘思维轴的矩阵）的唯一源
├── scripts/
│   ├── link-skills.sh        本机开发：把每个技能与元技能软链进 ~/.claude/skills 与 ~/.agents/skills
│   └── check-repo.mjs        仓库一致性检查：三处同步、引用可解析、无待写、无项目概念、无破折号、模板被链接、工具版本常量与 plugin.json 一致、写代码的四条只有一处索引、上下文地图每一格兑现（含横切技能与常驻卡片）
├── tests/                    仓库测试，vitest；根 package.json 钉依赖，npm ci 后直接跑
└── skills/
    ├── single-session-dev-flow/   总入口；handoff-checklist.md、handoff-pack-template.md、resident-card.md（常驻卡片，消费项目原样放进常驻入口文件）
    ├── teach-pqw-skills/             教人用这套流；mental-models.md、who-does-what.md、prompting.md
    ├── requirement-and-invariants/   requirement-template.md
    ├── domain-impact-analysis/       impact-template.md
    ├── tech-research-and-reuse/      reuse-template.md
    ├── formal-guard/                 formal-trigger-template.md
    ├── detailed-domain-design/       design-template.md
    ├── formal-docs-landing/          landing-template.md
    ├── spec-and-plan/                spec-template.md、plan-template.md、scripts/check-plan.mjs 命令面、scripts/lib/check-plan.mjs 逻辑
    ├── context-pack/                 run-pack-template.md、slice-kickoff-template.md
    ├── delegate-brief/               brief-template.md、sentinel-brief-template.md、cost.md、scripts/check-brief.mjs 命令面、scripts/lib/check-brief.mjs 逻辑
    ├── one-lesson-rule/              review-record-template.md、hosts.md、scripts/sentinel.mjs
    ├── slice-closeout/               closeout-checklist.md、metrics-model.md、scripts/{metrics,mutation}.mjs 命令面、scripts/sandbox-build.mjs（`--build-command` 时 Stryker 在沙箱里执行的包装）、scripts/lib/{core,adapter-typescript,metrics,mutation,stryker,version}.mjs 逻辑、scripts/package.json 钉 Stryker 引擎的依赖
    ├── progress-artifacts/           report-skeleton.md、report-template.html、demo-skeleton.html、scripts/{artifacts-dir,build-report,demo-append}.mjs 命令面、scripts/lib/{args,report,demo}.mjs 逻辑
    ├── cleanup/                      checklist-template.md、scripts/cleanup.mjs
    ├── think-orthogonal/             思维模型，横切；requirements-and-design.md、planning.md、diagnose-and-refactor.md
    ├── think-ought-vs-is/            思维模型，横切；design-and-build.md、optimize-and-refactor.md、diagnose.md、before-asking.md、no-more.md
    ├── think-model-first/            思维模型，横切；partial-and-total.md、translate.md、how-deep.md
    ├── think-right-then-well/        思维模型，横切；two-rounds.md、taste-checklist.md
    ├── think-evidence/               思维模型，横切；what-counts.md、tests-and-proofs.md、acceptance.md
    ├── think-closed-loop/            思维模型，横切；information.md、feedback-loop.md、batch-size.md、handoffs.md
    ├── candid-friend/                诤友，流程轴上横切；worth-doing.md、run-size.md、midway-and-closing.md、overnight.md
    ├── clear-writing/                写作，横切
    └── write-agents-md/              AGENTS.md 的撰写与治理，横切
```

每个技能目录一个 `SKILL.md`，模板与说明放同目录并由 `SKILL.md` 链接，脚本放 `scripts/`。脚本是直接 `node` 跑的 ESM，`--help` 可用；只有差分变异有依赖（Stryker，只支持 vitest 项目），装法见 `DEVELOPMENT.md`。

## 与 mattpocock/skills 的差别

| 他的 | 我们的 | 为什么 |
| --- | --- | --- |
| 五个分桶（engineering、productivity、misc、in-progress、deprecated） | 不分桶，`skills/` 下扁平 | 技能数量小，而且它们是一条流上的环节，分桶没有意义 |
| `docs/<bucket>/<skill>.md` 人读页 | 没有，`README.md` 与 `README_EN.md` 的表就是索引 | 环节的「为什么」写在 `SKILL.md` 里，不维护第二份 |
| changesets 发版流水线 | 手工改 `CHANGELOG.md` 与 `plugin.json` 版本 | 单人维护，少一层工具 |
| `.agents/` 写作约定与 ADR | 规则合进 `AGENTS.md` | 篇幅小，不值得分文件 |
| `ask-matt` 路由技能 | `single-session-dev-flow` 兼任路由；给人的路由图归 `teach-pqw-skills` | 流本身就是路由；人要的是教学不是菜单 |
| 用户触发与模型触发两类 | 全部模型可触发 | 交付期由主代理自主加载环节技能，不能有只许人触发的环节 |

## 技能的两类

- **自定义**：正文在本仓库，例如 `formal-guard`、`one-lesson-rule`。
- **引用外部**：正文只写本仓库的补充，用「加载技能 `<外部技能>`」指向 pstack、ub-mode、mattpocock 的技能，不复制它们的正文；Matt 的 `to-spec`、`to-tickets`、`to-questionnaire` 禁止模型调用，改为按已安装路径直接读正文。外部技能的名字和版本登记在 `README.md` 的依赖表。

另有六个横切的思维模型技能，`think-` 前缀，全部自定义。它们不是环节，回答「做这一步时怎么想」；每个长成同一副骨架：一个问题、三句动作、按工作类型的表、写在哪、什么时候必须重做、相邻的模型，正文 50 行以内，细节放至多五页展开。环节技能在要用到的那一步上放一句一字不差的指路行或模板空位，不复述做法。哪个环节用哪个模型，唯一源是 `design/context-map.json`，`check-repo` 第 10 段按它逐格核，并核骨架、防复述、核 README 的矩阵表与入口能走到六个技能。

另有一个流程轴上横切的技能 `candid-friend`（诤友），自定义。它不是思维模型，不用 `think-` 前缀，不进矩阵：它管代理对人说什么，看到人这一侧的风险说一次，人定了就照做。它放在哪些环节、模板里有哪些空位，登记在 `design/context-map.json` 的 `crosscut`，`check-repo` 按同样的核法核。六个模型与诤友各一句，压成 `single-session-dev-flow/resident-card.md` 这份常驻卡片，`check-repo` 核它点到每个技能。

## 适用范围

总入口技能的第一节就是适用范围：只为复杂系统新增领域、跨多领域纵线交付、子系统重构和较大规模改造而设；小修、原型、小规模增量接口不走，也不走缩水版。

## 流的形状

```
人主导 ───────────────────────────────▶│◀──────────── 代理自主 ──────────────────▶
1 需求与不变式 → 2 领域影响 → 3 技术复用 │ 7 spec/plan → 8 消熵 → 切片 TDD
→ 4 形式化 → 5 细化设计 → 6 正式落盘     │   → 9 派发 → 11 收口 → 12 汇报 → 13 清理
                                       │        ▲ 10 哨兵定时唤醒，每 45～60 分钟回看 ┘
                              交接点：长期知识进唯一源并过评审
```

只服务一个会话里的一个主代理和它的子代理，不做多会话协作。汇报件与过程产物放系统临时目录下 `pqw-skills/<会话标识>/<一程标识>/`，每切片清一次中间产物，一程交付后全盘清理。

## 现在的状态

0.21.0：新增第六个思维模型技能 `think-closed-loop`（闭环），发行技能共二十四个；上下文地图多一列与「交接点」一行；`delegate-brief` 多一页 `cost.md`，`check-brief` 多核新模板的规格文件、读量上限与报告行数上限，`check-plan` 按表头名取子代理表的列并核 token。0.19.0：新增五个思维模型技能 `think-orthogonal`、`think-ought-vs-is`、`think-model-first`、`think-right-then-well`、`think-evidence`，发行技能共二十二个；`design/context-map.json` 是上下文地图的唯一源，`check-repo` 第 10 段核每一格；入口「写代码的四条」变成四句结论各指向所属模型（`check-repo` 第 8 段守索引）；`check-plan` 核未收口且开工包已填的切片的思维模型栏，旧模板只给提示；plan 模板进度总览多「思维模型」一行，开工包多「全化表」一栏，「顺序与并行」多「切片的轴」一行；收口清单多品味核对单。0.17.0 与 0.18.0：设计段风险前置、形式化交接表与精化对照表；差分变异缺省只变异改动的行。0.16.0：哨兵的改动文件取第一父链非合并提交、在跑只看状态词、多三条文档陈旧信号；`check-plan` 多核预计收尾、子代理状态词、收口的「改动成员的合入检查」、验收经过的成员与晚于时钟的时刻；新增 `spec-and-plan/scripts/consumers.mjs` 与 `delegate-brief/scripts/check-brief.mjs`；`slice-closeout` 的读数与变异修了十处口径（见 `metrics-model.md`）；`clear-writing`、`write-agents-md` 从 `meta/skills/` 移到 `skills/` 随插件发行，`meta/skills/` 现在为空；`tests/global-setup.mjs` 给整轮测试一个临时根，跑完删掉。0.15.0 起：`slice-closeout` 分两个尺度：切片收口的结构读数与差分变异只打开工包写的关键位置（`--scope` 加 `--files`），一程全量读数在全部切片收口后做一次，基线是 spec 的起点提交，记录在收口清单末尾；开工包模板、plan 与 spec 模板、交付声明、入口与教学同步，接入槽位多一格「项目合入检查已跑的全量读数」。0.14.0 起：责任分级接通到交付期。入口技能「圈外的问题」是唯一正文（`check-repo` 第 9 段守），spec 必需「责任分级」，plan 必需「圈外发现」，交接信息包的边界带同一张表，`check-plan` 核这三处；哨兵脚本按 spec 的路径报「圈外改动」，第一问加「在圈外做功」，间隔按一程预算定（`one-lesson-rule` 的节拍一节）。0.13.0 起：哨兵「实现是否比本质复杂」一问多一类证据，从已定义的不变式出发看有没有在为不变式排除的状态做功，提醒链到入口四条第三条；`one-lesson-rule` 多一个出口「删掉不可能的路径」。0.12.1 起：修了 pnpm 多包仓库试用中的五处缺陷（大仓库 diff 缓冲与范围收窄、pnpm 隔离布局下的 Stryker runner、没给 `--ts` 时自动找 typescript、`coverage/` 报告不算改动、`check-plan --handoff` 的占位与起点反引号）。0.12.0 起：差分变异支持多包仓库，`mutation.mjs --project <成员目录>` 在成员里跑 Stryker，容器放成员上两级、沙箱与成员同深度，`--build-command` 经 `scripts/sandbox-build.mjs` 在沙箱里先链依赖再构建。定义期与交付期可以分两个会话顺序交接，交接信息包模板在 `single-session-dev-flow/handoff-pack-template.md`，`check-plan --handoff` 核它的结构；`teach-pqw-skills/mental-models.md` 末节是「AI 主导研发交付的心智」十条。入口技能开头是「写代码的四条」（唯一正文，`check-repo` 第 8 段守），切片循环分做对与做好一轮，`check-plan` 核收口里的「做好一轮」。十五个发行技能正文齐全且宿主无关，模板与脚本随技能目录发行，两个写作技能迁自 omne-harness-lite（0.16.0 起随插件发行）。plan 模板有给人读的两层叙述与文档维护表，`spec-and-plan/scripts/check-plan.mjs` 守结构，哨兵判六问（含文档陈旧与实现是否比本质复杂），汇报件开头讲这程为什么做。结构读数、差分变异、HTML 汇报件与 demo 追加四个工具随技能发行，逻辑在 `scripts/lib/`；差分变异只有 Stryker 引擎，适配在 `slice-closeout/scripts/lib/stryker.mjs`，超时的变异体单独复核，依赖钉在 `slice-closeout/scripts/package.json`；清理只判断还要不要。读数多列没有断言的用例与没有函数的改动文件。本仓库测试迁 vitest，根 `package.json` 钉测试链依赖，`tests/` 118 个用例。`node scripts/check-repo.mjs` 退出 0。

## 校验

`claude plugin validate .` 通过。带 `--strict` 会失败，原因是两条有意接受的警告：根目录 `CLAUDE.md` 不会随插件分发（它只服务本仓库开发），以及没有插件图标（不打算提交插件目录）。
