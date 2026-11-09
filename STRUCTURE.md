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
├── design/                   设计文档：环节映射、自带资产与接入点、吸收的外部经验
├── meta/skills/              元技能，只给维护本仓库的代理用，不发行
│   ├── clear-writing/
│   └── write-agents-md/
├── scripts/
│   ├── link-skills.sh        本机开发：把每个技能与元技能软链进 ~/.claude/skills 与 ~/.agents/skills
│   └── check-repo.mjs        仓库一致性检查：三处同步、引用可解析、无待写、无项目概念、无破折号、模板被链接、工具版本常量与 plugin.json 一致、写代码的四条只有一处正文
├── tests/                    仓库测试，vitest；根 package.json 钉依赖，npm ci 后直接跑
└── skills/
    ├── single-session-dev-flow/   总入口；handoff-checklist.md、handoff-pack-template.md
    ├── teach-pqw-skills/             教人用这套流；mental-models.md、who-does-what.md、prompting.md
    ├── requirement-and-invariants/   requirement-template.md
    ├── domain-impact-analysis/       impact-template.md
    ├── tech-research-and-reuse/      reuse-template.md
    ├── formal-guard/                 formal-trigger-template.md
    ├── detailed-domain-design/       design-template.md
    ├── formal-docs-landing/          landing-template.md
    ├── spec-and-plan/                spec-template.md、plan-template.md、scripts/check-plan.mjs 命令面、scripts/lib/check-plan.mjs 逻辑
    ├── context-pack/                 run-pack-template.md、slice-kickoff-template.md
    ├── delegate-brief/               brief-template.md
    ├── one-lesson-rule/              review-record-template.md、hosts.md、scripts/sentinel.mjs
    ├── slice-closeout/               closeout-checklist.md、metrics-model.md、scripts/{metrics,mutation}.mjs 命令面、scripts/sandbox-build.mjs（`--build-command` 时 Stryker 在沙箱里执行的包装）、scripts/lib/{core,adapter-typescript,metrics,mutation,stryker,version}.mjs 逻辑、scripts/package.json 钉 Stryker 引擎的依赖
    ├── progress-artifacts/           report-skeleton.md、report-template.html、demo-skeleton.html、scripts/{artifacts-dir,build-report,demo-append}.mjs 命令面、scripts/lib/{args,report,demo}.mjs 逻辑
    └── cleanup/                      checklist-template.md、scripts/cleanup.mjs
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
- **引用外部**：正文只写本仓库的补充，用「加载技能 `<外部技能>`」指向 pstack、ub-mode、mattpocock 的技能，不复制它们的正文；Matt 的 `to-spec`、`to-tickets` 禁止模型调用，改为按已安装路径直接读正文。外部技能的名字和版本登记在 `README.md` 的依赖表。

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

0.12.1：修了 pnpm 多包仓库试用中的五处缺陷（大仓库 diff 缓冲与范围收窄、pnpm 隔离布局下的 Stryker runner、没给 `--ts` 时自动找 typescript、`coverage/` 报告不算改动、`check-plan --handoff` 的占位与起点反引号）。0.12.0 起：差分变异支持多包仓库，`mutation.mjs --project <成员目录>` 在成员里跑 Stryker，容器放成员上两级、沙箱与成员同深度，`--build-command` 经 `scripts/sandbox-build.mjs` 在沙箱里先链依赖再构建。定义期与交付期可以分两个会话顺序交接，交接信息包模板在 `single-session-dev-flow/handoff-pack-template.md`，`check-plan --handoff` 核它的结构；`teach-pqw-skills/mental-models.md` 末节是「AI 主导研发交付的心智」十条。入口技能开头是「写代码的四条」（唯一正文，`check-repo` 第 8 段守），切片循环分做对与做好一轮，`check-plan` 核收口里的「做好一轮」。十五个发行技能正文齐全且宿主无关，模板与脚本随技能目录发行，两个元技能迁自 omne-harness-lite。plan 模板有给人读的两层叙述与文档维护表，`spec-and-plan/scripts/check-plan.mjs` 守结构，哨兵判六问（含文档陈旧与实现是否比本质复杂），汇报件开头讲这程为什么做。结构读数、差分变异、HTML 汇报件与 demo 追加四个工具随技能发行，逻辑在 `scripts/lib/`；差分变异只有 Stryker 引擎，适配在 `slice-closeout/scripts/lib/stryker.mjs`，超时的变异体单独复核，依赖钉在 `slice-closeout/scripts/package.json`；清理只判断还要不要。读数多列没有断言的用例与没有函数的改动文件。本仓库测试迁 vitest，根 `package.json` 钉测试链依赖，`tests/` 118 个用例。`node scripts/check-repo.mjs` 退出 0。

## 校验

`claude plugin validate .` 通过。带 `--strict` 会失败，原因是两条有意接受的警告：根目录 `CLAUDE.md` 不会随插件分发（它只服务本仓库开发），以及没有插件图标（不打算提交插件目录）。
