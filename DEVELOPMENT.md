# 本机开发

本文件讲怎样在本机改、验、发这套技能。参与规则归 [CONTRIBUTING.md](./CONTRIBUTING.md)，布局与写作规则归 [AGENTS.md](./AGENTS.md)。

## 前提

- Node 20 以上。脚本是直接 `node` 跑的 ESM；结构读数没有依赖。差分变异由 Stryker 执行，要 `@stryker-mutator/core` 与 `@stryker-mutator/vitest-runner`，优先用被测项目自己 `node_modules` 里的（给了 `--project` 时先找成员的，再找 Git 根的），没有就 `npm ci --prefix skills/slice-closeout/scripts` 装到技能目录（版本钉在那里的 `package.json`，`node_modules` 已忽略）。本仓库自己是 vitest 项目，根 `package.json` 装着同样的包，自跑走 Stryker。
- 至少一个宿主：Claude Code、Codex 或 Cursor。校验插件清单需要 Claude Code 的 `claude` 命令。
- 外部技能已按各自说明装好：pstack、ub-mode、mattpocock/skills。版本见 `README.md` 的依赖表。`scripts/check-repo.mjs` 会读本机安装目录核对引用，没装会报「无法核对」。

## 链接进宿主

```bash
bash scripts/link-skills.sh
```

把 `skills/*` 与 `meta/skills/*` 软链进 `~/.claude/skills` 与 `~/.agents/skills`。增删重命名技能后重跑。链接后宿主新开会话即可看到技能；已经开着的会话不会重新加载。

## 一致性检查与测试

```bash
npm ci
node scripts/check-repo.mjs
claude plugin validate .
npx vitest run
```

`tests/` 用 vitest 跑、`node:assert/strict` 断言，夹具在系统临时目录建小 Git 仓库。根 `package.json` 钉着测试链的依赖（vitest、覆盖率插件、Stryker 两个包、typescript），`npm ci` 之后用例从仓库根的 `node_modules` 解析 typescript 与 Stryker；`PQW_TS`、`PQW_STRYKER_MODULES` 两个环境变量仍可覆盖，取不到时相关用例跳过并打印原因。命令面用例真起子进程，整套约半分钟；真起 Stryker 的几条占大头。

结构读数、差分变异、汇报件、demo 追加四个工具的逻辑在各自 `scripts/lib/` 下的函数里，`scripts/*.mjs` 只是命令面；哨兵、汇报件目录、清理三个脚本仍是单文件。改工具时用它自己量自己：

```bash
# 覆盖率：vitest 的 v8 插件，lcov 落在 coverage/lcov.info（已忽略）；子进程里跑的命令面行不计入
npx vitest run --coverage
# 只摘改动函数的读数
node skills/slice-closeout/scripts/metrics.mjs --base <起点提交> --lcov coverage/lcov.info --scope skills/slice-closeout/scripts
# 只打改动单元的位点，由 Stryker 执行；增量文件在系统临时目录，第二轮自动沿用
node skills/slice-closeout/scripts/mutation.mjs --base <起点提交> --scope skills/slice-closeout/scripts --json tmp/mutation.json
```

命令面的用例只从 CLI 进，摸不到排序、汇总、边界这些分支；变异分数低时补直打 lib 函数的用例（`tests/*-lib.test.mjs`），不改命令面用例。模块级常量上的变异体 Stryker 测不出是哪些用例碰到它，只能跑全部用例，其中十来条会真起 Stryker，一轮就从一两分钟拉长到十几分钟：要测的值写成函数，或在直打用例里钉住原值。

第一条核：`skills/` 扁平布局、frontmatter、无「待写」、三处同步、外部引用在钉定版本里存在、DMI 技能的措辞、发行技能、模板、脚本与网页里无项目概念禁词、全仓散文与脚本无破折号（`tests/` 与 `check-repo.mjs` 自身免检）、模板被 `SKILL.md` 链接、工具版本常量与 `plugin.json` 一致、写代码的四条与圈外的问题各只有一处正文、上下文地图每一格兑现。上下文地图一项按 `design/context-map.json` 核：标「主」的格对应技能点名了模型，标「行」的格对应文件含一字不差的指路行，标「空」的格对应模板含列出的空位；六个 `think-` 技能的骨架与行数；别处一行同时出现某个模型的两个标志词时要点技能名；README 的矩阵表与地图逐行一致；入口技能、教学技能与两份 README 都点到六个技能。流程轴上的横切技能登记在地图的 `crosscut`，各格按同样的核法核，另核正文行数与入口可达；常驻卡片（`residentCard`）核它点到每个模型与横切技能，每行末尾的技能名存在。改地图的一格，先改 `design/context-map.json`，再改对应的文件与 README 的那一行。退出 0 通过，1 列出失败，2 用法错误。

一程进行中另有一条：`node skills/spec-and-plan/scripts/check-plan.mjs --plan <plan> --spec <spec>` 核这程的 plan 与 spec 是否仍合模板，含预计收尾对人的验收窗口与子代理表的 token（旧 plan 只提示），退出 0 合、1 有缺陷并逐条列出、2 用法错误；收口最后一步、哨兵每轮、汇报件生成前各跑一次。派子代理之前另有一条：`node skills/delegate-brief/scripts/check-brief.mjs <简报>` 核简报的结构、评审措辞，以及新模板的规格文件、读量上限、报告行数上限（旧简报只提示）。

第二条校插件清单。它会给两条警告，都是预期，所以不用 `--strict`（它把警告算失败）：一、根目录 `CLAUDE.md` 不作为插件上下文分发。它只是 `@AGENTS.md` 一行，给在本仓库里工作的 agent 指路，不是给装了插件的人看的，保留。二、没有图标。校验说明写明上架图标只在第一次保存或提交到插件目录时生效，之后改不了，所以不放占位图；要不要加、加什么，由仓库作者定。

## 跑脚本

三个发行脚本各自 `--help`，并各跑一次真实运行：

```bash
node skills/progress-artifacts/scripts/artifacts-dir.mjs --help
node skills/one-lesson-rule/scripts/sentinel.mjs --plan tmp/<一程>/plan.md --interval 2s --once
node skills/cleanup/scripts/cleanup.mjs --scope slice --prefix <前缀> --plan
```

清理脚本默认只列不删，只有 `--apply` 才动手。哨兵的宿主接法见 `skills/one-lesson-rule/hosts.md`。

## 改 README 的图

README 开头两张信息图用 kami 的视觉规范（github.com/tw93/kami）：羊皮纸底 `#f5f4ed`，只有墨蓝 `#1B365D` 一个强调色，其余是暖灰，中文衬线字，细线，圆角不超过 6，不用阴影、渐变和第二种颜色。图自带底色，不做深色版。

- `assets/story.svg`：故事图，手写 SVG。文字不会自动换行，改字时按字数核每行的宽度。
- `assets/map.svg`：全景图，由 `node assets/gen-map.mjs` 生成，矩阵从 `design/context-map.json` 读。改了上下文地图、增删技能或脚本之后重跑。
- `assets/flow.svg`：旧的流程图，手写 SVG，带深色模式样式，只有 `README_EN.md` 还在用。

改完本地看一眼，窗口高度取 SVG 的 `height`：

```bash
<chromium> --headless --no-sandbox --disable-gpu --hide-scrollbars --window-size=960,1500 --screenshot=/tmp/story.png file://$PWD/assets/story.svg
```

本机没有 `rsvg-convert` 时用 Playwright 缓存里的 Chromium 即可。

## 用自己的流改自己

改技能正文属于「较大规模改造」时，按 `single-session-dev-flow` 走一程：spec 与 plan 用 `skills/spec-and-plan` 的模板写在 `tmp/<一程>/`（已忽略），每切片收口跑一次一致性检查，程末按 `cleanup` 清理。小修直接改。

## 升级外部钉定版本

1. 升级本机宿主里的 pstack、Matt、ub-mode。Claude Code 与 Codex 的插件源按目录钉定，升级是重新注册市场到新克隆目录再装。
2. 改 `README.md` 与 `README_EN.md` 的依赖表。
3. 跑 `node scripts/check-repo.mjs`，逐个处理被引用技能改名或改行为的失败。
4. 在 `CHANGELOG.md` 记一条。

## 发版

1. `CHANGELOG.md` 加一条，`.claude-plugin/plugin.json` 改 `version`，`skills/slice-closeout/scripts/lib/version.mjs` 改 `TOOL_VERSION`，三处一起改；`check-repo` 核后两处一致。版本号变了托管路线才会重装，工具版本变了差分变异不再沿用旧历史。
2. `README.md` 与 `README_EN.md` 的徽章与「状态」节同步版本。
3. 两条检查通过后提交，打 tag `v<版本>`。
