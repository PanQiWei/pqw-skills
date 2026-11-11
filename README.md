# pqw-skills

把一程长活，放心交给 agent：你和它先把边界定清，一次交出一程，它按切片自主交付，你回来验收。给 Claude Code、Codex、Cursor 等 coding agent 的 25 个技能。

```bash
claude plugin marketplace add PanQiWei/pqw-skills
claude plugin install pqw-skills@pqw
```

Codex、Cursor、Kimi Code、DSH、Copilot、Gemini 的装法见[安装](#安装)。装好后问一句「这套流怎么用」，它会教你。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.22.2-informational.svg)](./CHANGELOG.md)
[![Skills](https://img.shields.io/badge/skills-25-success.svg)](#技能)
[![skills.sh](https://skills.sh/b/PanQiWei/pqw-skills)](https://skills.sh/PanQiWei/pqw-skills)
[![Hosts](https://img.shields.io/badge/hosts-Claude%20Code%20%7C%20Codex%20%7C%20Cursor%20%7C%20Kimi%20Code%20%7C%20DSH%20%7C%20Copilot%20%7C%20Gemini-8A2BE2.svg)](#安装)
[![Language](https://img.shields.io/badge/lang-%E4%B8%AD%E6%96%87%20%7C%20English-lightgrey.svg)](./README_EN.md)

[English](./README_EN.md)

![把一程长活，放心交给 agent。第一幕，没有它：一句话就开工，做到一半偏了，同一处修三遍，报告写全部完成，你花一天返工。第二幕，有它：定义期你主导六步，交接期定约、定程、交出一程，agent 自主按切片推进、哨兵定时回看，你回来验收，收回之后再交下一程。第三幕，你得到的六样：不白做、不猜边界、不乱想、不走偏、不自夸、不透支你。](./assets/story.svg)

我与 Claude Code、Codex、Cursor 等 coding agent 协作沉淀出的单会话研发流。它是一条控制回路：先在动手前把不确定性尽量消掉，再把执行放手给代理，再用固定节拍从顶层回看。你的注意力只花在定义边界和高层判断上，不花在逐行盯实现上。

## 什么时候用

这条流只为大改动而设。判据是影响范围：改动会触及领域边界、跨域协作或系统全局的架构时才走。

| 走这条流 | 不走这条流 |
| --- | --- |
| 复杂系统新增一个领域 | 小的缺陷修复 |
| 跨多个领域的功能纵线交付 | 快速原型，验证一个想法 |
| 子系统重构 | 小规模的增量接口设计与实现 |
| 较大规模的改造 | 一处局部修改，影响范围一眼看得清 |

不够格的工作整条流都不走，不走缩水版，直接按各自的技能做。

## 有哪些东西

![技能集全景：25 个技能，两条轴。横着是流程轴的 13 个环节，定义期六步由你主导，中间一段交接期，交付期七步由 agent 自主。竖着是思维轴的六个模型：拆、找差异、定形、建、证、转手，加一个对人直言的诤友。交点标出每个想法在哪一步出现。下面列出 13 个环节与交接期各回答的问题、入口与教学、写作技能、给项目的常驻卡片，以及九个自带脚本。](./assets/map.svg)

仓库是扁平的：一个总入口技能，13 个环节技能，一个交接期的阶段技能，六个横切的思维模型技能，一个诤友技能，加教学与写作技能。自定义的环节正文在这里，已有成熟做法的环节直接引用 pstack、ub-mode、mattpocock 的技能，不复制它们的正文。

定义期由你主导，每一步回答一个问题、产出一样东西，并且是下一步的输入，顺序不能跳。交接期像接力赛的接力区，由设计会话做，你在场：定约写这一程的 spec，定程定这一程多大、要不要分程，交出写交接信息包，包里只有这一程。交出是物理条件：没进唯一源、没过评审的边界不算定好。交出之后，你可以把注意力移开，由主代理自主推进交付；这一程交回来，你回到设计会话收回：上手验收，再交下一程。

## 技能

上面两张图是全貌。每个技能做什么、引用了哪些外部技能，展开下面的细目。

<details>
<summary>技能细目</summary>

### 总入口

- **[single-session-dev-flow](./skills/single-session-dev-flow/SKILL.md)**：判断够不够格走这条流，定阶段、顺序、交接期，把 13 个环节与交接期的四件事写进会话任务清单，指出每个环节加载哪个技能。不写环节的做法。开头一节「写代码的四条」（先做对；再做好一轮；不过度设计、不提前优化；找本质解）对一切写代码的工作适用，是这几条心智在本仓库的唯一正文。引用 in-your-own-words、poteto-mode、tdd；不够格时转 prototype、diagnosing-bugs。
- **[teach-pqw-skills](./skills/teach-pqw-skills/SKILL.md)**：教人用这套流。心智模型与哲学、每个环节人和代理各做什么、第一条提示怎么写、跑偏了怎么纠、接入自己的项目。只回答并给示例提示，不开工。

### 定义期，人主导

| 环节 | 技能 | 回答的问题 | 引用 |
| --- | --- | --- | --- |
| 1 | [requirement-and-invariants](./skills/requirement-and-invariants/SKILL.md) | 给用户什么能力，系统前后有什么区别；系统永远要守住什么 | in-your-own-words、grilling |
| 2 | [domain-impact-analysis](./skills/domain-impact-analysis/SKILL.md) | 哪些领域受影响，要不要新领域，谁是重点谁是连带，全局怎么摆 | domain-modeling、principle-model-the-domain、blast-radius |
| 3 | [tech-research-and-reuse](./skills/tech-research-and-reuse/SKILL.md) | 有没有现成的库、相近系统或社区实现可复用，自造的论证是什么 | research、principle-subtract-before-you-add |
| 4 | [formal-guard](./skills/formal-guard/SKILL.md) | 哪些性质靠测试守不住，要靠偏函数全化、数理建模与证明 | create-formal-verification-skill、statechart、maintain-formal-verification-skill |
| 5 | [detailed-domain-design](./skills/detailed-domain-design/SKILL.md) | 领域内部的对象、关系、仓储长什么样，I/O 与查询性能怎么定 | domain-modeling、codebase-design、architect、principle-type-system-discipline、principle-boundary-discipline |
| 6 | [formal-docs-landing](./skills/formal-docs-landing/SKILL.md) | 哪些要长期维护写正式文档，哪些以源码为文档，落在哪一层；五类判据的确定性文档评审 | technical-writing、writing-for-agents |

### 交接期，设计会话与你

- **[pass-the-baton](./skills/pass-the-baton/SKILL.md)**：交棒。交接从一个点变成一段接力区，夹在定义期与交付期之间，由设计会话做，你在场。四件事：定约，和你一起写这一程的 spec；定程，写切片大纲、问你的验收窗口、做尺寸核对，要分程就写路线图；交出，走交接点核对单、写交接信息包；收回，这一程交回来之后你上手验收，它记进路线图、修订后面的程，再交下一程。设计会话是编排者，路线图只归它；交付会话只知道自己这一程，不和你谈范围，包有问题就退包。一次只交出一程。设计与交付分在两个会话时，缺省用 GitHub issue 协调，项目可以换成别的工单系统，没有就退回到文件。自带交接点核对单、交接信息包模板（含切片大纲）、路线图模板与 GitHub issue 的做法一页。它不是编号的环节，不进矩阵；它的指路行登记在 `design/context-map.json` 的 `stages`，`check-repo` 逐处核。

### 交付期，代理自主

| 环节 | 技能 | 做什么 | 引用 |
| --- | --- | --- | --- |
| 7 | [spec-and-plan](./skills/spec-and-plan/SKILL.md) | 两个时机：交接期定约时写 spec，定目标、边界、验收标准；交付期开头写 plan，从切片大纲起步切成有序切片；自带两份模板与 `check-plan.mjs`（核 plan、spec 与交接信息包的结构，包可以从标准输入读） | to-spec、to-tickets（读安装路径）、sharpen |
| 8 | [context-pack](./skills/context-pack/SKILL.md) | 整程开工前整理上下文包并做关键环节的细化设计与技术验证；每切片前做开工包：上下文增量、技术设计与验证、细化推进方案、里程碑待办清单 | architect、prototype、principle-guard-the-context-window、recall |
| 9 | [delegate-brief](./skills/delegate-brief/SKILL.md) | 主代理自己做是默认：先按两个判据（做对它用到多少说不出来的上下文、中间过程是不是又大又用完就扔）定自己做还是派，再过派发门；派时给齐目标、边界、规格文件、信息包，框住读量，档位按活定、顶档不当子代理；原始结果写进文件，报告限行带指针；一页讲钱是怎么花的；验收防作弊、升级、合回。自带 `check-brief.mjs` | poteto-mode、swarm、principle-separate-before-serializing-shared-state |
| 10 | [one-lesson-rule](./skills/one-lesson-rule/SKILL.md) | 便宜档的只读哨兵子代理常驻后台，持有 spec 与 plan，每 45 分钟自己醒来取工作树事实、判六问、发十行以内的消息；主代理在停顿点处置；子代理每 30 分钟看一次健康度 | recall、show-me-your-work |
| 11 | [slice-closeout](./skills/slice-closeout/SKILL.md) | 每切片收口六步：类型检查与 lint、对照 spec 与不变式、结构读数与差分变异（只打关键位置）、去 AI slop、证明可用；全部切片收口后整程全量读数一次；确定性验收，不做对抗性评审。自带 `metrics.mjs`（改动函数的圈复杂度、认知复杂度、CRAP）与 `mutation.mjs`（热点差分变异，带预算与还原），与语言无关的模型加 TypeScript 适配器 | code-review、deslop、unslop、principle-prove-it-works、typescript-best-practices、ub-mode |
| 12 | [progress-artifacts](./skills/progress-artifacts/SKILL.md) | 用架构图、UML、快速 demo 等用完即弃的汇报件让人留在高层，放系统临时目录；自带目录脚本、`build-report.mjs` 网页汇报件生成器、demo 骨架与 `demo-append.mjs` | ketchup、prototype |
| 13 | [cleanup](./skills/cleanup/SKILL.md) | 每切片清一次不必留给下一切片的中间产物；一程交付后全盘清理；只判断还要不要，不要的直接删；自带清理脚本与交付声明 | 无 |

实施本身走 TDD，不过度设计，不过度优化，由 `pstack:poteto-mode` 与 `mattpocock-skills:tdd` 承载，本仓库不另写。表里的「引用」列是各 `SKILL.md` 当前声明的外部技能；完整的主引用与辅助引用见 [design/skill-mapping.md](./design/skill-mapping.md)。

### 思维模型，横切

流程轴回答「现在走到哪一步、产出什么」，是上面 13 个环节。思维轴回答「做这一步时怎么想」，是下面六个思维模型。两条轴互相独立：任何一步都可能用到任何一个模型，所以它们不是环节，而是随时可以单独加载的技能，不走这条流时也适用。输入 `/think-` 就能看到全部六个。

| 次序 | 技能 | 回答的问题 | 三句动作的要点 |
| --- | --- | --- | --- |
| 拆 | [think-orthogonal](./skills/think-orthogonal/SKILL.md) | 这个问题的空间怎么拆 | 找出独立变化的轴，每条归一个拥有者；交叉成表逐格看；同一个结构在大小尺度上只设计一次 |
| 找差异 | [think-ought-vs-is](./skills/think-ought-vs-is/SKILL.md) | 这件事的工作到底是什么 | 它应该是什么样，它现在是什么样，两者差在哪；差异就是全部工作 |
| 定形 | [think-model-first](./skills/think-model-first/SKILL.md) | 代码该长成什么形状 | 状态与操作写成偏函数并全化；再翻成领域模型与对象模型，然后写代码 |
| 建 | [think-right-then-well](./skills/think-right-then-well/SKILL.md) | 按什么顺序建，怎样算好 | 做对只求验收标准逐条过；做好一轮不加能力只改实现；由读数、变异与品味核对单判 |
| 证 | [think-evidence](./skills/think-evidence/SKILL.md) | 怎么知道它是真的 | 每个结论带证据或标签；证据要真的检验了它声称检验的东西；证真交给证明，证伪交给测试 |
| 转手 | [think-closed-loop](./skills/think-closed-loop/SKILL.md) | 这件事该由谁做，一次做多大，多久看一次 | 转手会丢信息，做对它要用到的写不下来的上下文多就不转；回路越紧越稳；一块多大由接的一方验得完多少定 |

前五个是放在一件事上的自然次序。第六个闭环讲这件事在人和代理之间转手：人转给主代理，主代理转给子代理，压缩前的自己转给压缩后的自己。

两条轴交叉出下面这张上下文地图。「主」是这个环节的产出本身就是这个模型的成果；「空」是模板里有它的固定空位，填模板时自然就做了；「行」是在要用到的那一步上有一句一字不差的指路行；空白是有意不放。最后一行是 plan 进度总览里列着六个技能名的那一行，上下文压缩之后按它重新加载。唯一源是 [design/context-map.json](./design/context-map.json)，这张表照它生成，`check-repo` 逐格核它在仓库里兑现了没有。

| 环节 | `think-orthogonal` | `think-ought-vs-is` | `think-model-first` | `think-right-then-well` | `think-evidence` | `think-closed-loop` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 需求与不变式 | 行 | 主 |  |  |  |  |
| 2 领域影响 | 主 | 行 |  |  |  |  |
| 3 调研与复用 |  | 主 |  |  |  |  |
| 4 形式化守护 | 行 |  | 主 |  | 主 |  |
| 5 细化设计 | 行 | 空 | 主 |  | 行 | 行 |
| 6 正式落盘 |  |  |  |  |  | 行 |
| 交接期 |  | 行 |  |  | 主 | 行 |
| 7 plan | 空 |  |  |  |  |  |
| 8 切片开工包 | 行 | 空 | 空 | 空 |  | 行 |
| 9 派发 |  | 空 |  |  | 主 | 主 |
| 10 哨兵回看 |  | 行 |  | 行 | 主 | 主 |
| 11 切片收口 |  | 行 |  | 主 | 主 |  |
| 12 汇报 |  | 主 |  |  |  | 行 |
| 13 清理 |  |  |  |  |  |  |
| 不够格的小活 |  | 行 |  | 行 | 行 |  |
| 压缩之后 | 空 | 空 | 空 | 空 | 空 | 空 |

接入自己的项目时，把[常驻卡片](./skills/single-session-dev-flow/resident-card.md)原样放进项目的常驻入口文件，例如根 AGENTS.md：六个思维模型与诤友各一句，每句末尾是技能名，不走这条流的会话也看得到它们。升级之后重新同步这一段，项目不手写第二份。写法见 `teach-pqw-skills` 的「接到自己的项目」。

### 诤友，流程轴上横切

- **[candid-friend](./skills/candid-friend/SKILL.md)**：诤友，直言一次，然后听你的。别的技能防代理的失败，它防人的失败：需求不清或没有使用证据、一程大过人在一个验收窗口里验得完的量、离开前交接缺项、上一程没验就交下一程。代理用固定四行对人说一次：提醒、依据、建议、你可以；人定了就照做，不打折扣，不附加条件。四个时机都在设计会话里：接需求时问值不值得做，定程时做尺寸核对并给分程建议，交出之前做睡前交接，收回时先验再交下一程。交付期不发起和人的谈话，只做两件不问人的事：预计收尾滑出验收窗口时截程交付，收尾时列出待人验收。它不是思维模型，不进上面的矩阵；放在哪些环节由 `design/context-map.json` 的 crosscut 一项登记，`check-repo` 一样逐处核。接需求时的问法综合自 gstack（github.com/garrytan/gstack）的 office-hours、plan-ceo-review 与 ETHOS，以及 Matt 的 grilling、triage、to-questionnaire、prototype、wayfinder；gstack 只是思想来源，不加载。引用 grilling、to-questionnaire（读安装路径）、prototype。

</details>

## 外部依赖

| 技能 | 来源 | 版本 | 本机名 |
| --- | --- | --- | --- |
| poteto-mode、deslop、unslop、create-formal-verification-skill、statechart、maintain-formal-verification-skill、architect、sharpen、recall、show-me-your-work、ketchup、in-your-own-words、blast-radius、swarm、technical-writing、typescript-best-practices 及 principle 系列 | Claude Code 与 Codex 用 [michael-denyer/pstack-claude](https://github.com/michael-denyer/pstack-claude/tree/df9bc05b818e2457ac23d3343e96e4ff284dd9e9/plugins/pstack)；Cursor 用 [cursor/plugins](https://github.com/cursor/plugins/tree/1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def) 的官方 pstack | port 0.9.132；Cursor 0.15.20 | `pstack:<name>` |
| ub-mode | [unclebob/ub-mode](https://github.com/unclebob/ub-mode/tree/3da62bf3f)，只有一份 `SKILL.md`，放进宿主的用户技能目录 | 提交 3da62bf | `ub-mode` |
| to-spec、to-tickets、to-questionnaire、research、domain-modeling、codebase-design、code-review、tdd、prototype、diagnosing-bugs、grilling、writing-for-agents | [mattpocock/skills](https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills) | 1.3.2，提交 4ae2317 | `mattpocock-skills:<name>` |

引用外部技能的环节只写本仓库的补充，正文里用「加载技能 `<技能名>`」指向它们，怎么加载由宿主定。例外是 Matt 的 `to-spec`、`to-tickets` 与 `to-questionnaire`：它们声明了 `disable-model-invocation: true`，宿主不让模型用 Skill 工具调用，所以按已安装路径直接读正文，并在报告里写明读取方式。表里的版本是本仓库正文核对过的版本，升级时重新核对被引用的技能有没有改名或改行为。

技能正文与脚本本身不装 npm 包。只有 `slice-closeout` 的差分变异有依赖（`@stryker-mutator/core`、`@stryker-mutator/vitest-runner`，版本钉在 `skills/slice-closeout/scripts/package.json`）：它只支持用 vitest 的项目，优先用项目自己 `node_modules` 里的 Stryker，没有就 `npm ci --prefix <该 scripts 目录>` 装到技能目录；不满足时工具退出并说明。结构读数没有依赖。

维护本仓库时另用 Claude Code 的 `skill-creator` 插件（`claude-plugins-official`）审技能，用 `/skill-doctor` 报告量使用率。两者是宿主工具，不是本仓库引用的技能。

## 安装

两条路线：插件路线是只读的托管包，自动更新；skills.sh 路线把可编辑的文件复制进你的项目，手动更新。每个宿主只选一条，两条都装会让每个技能出现两次。能自动更新的宿主优先走插件路线。

本仓库自带插件市场（`.claude-plugin/marketplace.json`），市场名 `pqw`，插件名 `pqw-skills`。版本号在 `.claude-plugin/plugin.json` 里，变了才会触发托管路线重装。

| 宿主 | 路线 | 自动更新 |
| --- | --- | --- |
| Claude Code | `@pqw` 市场 | 是，默认 |
| Codex | `@pqw` 市场 | 是，启动时 |
| GitHub Copilot CLI | `@pqw` 市场 | 是，需一次性开 `autoUpdate` |
| VS Code | Chat: Install Plugin From Source | 是，每天 |
| Kimi Code | `/plugins install`，托管副本 | 否，重跑命令 |
| DeepSeek Harness（DSH） | 复制进它的技能目录 | 否，拉取后重新复制 |
| Gemini CLI | `gemini skills install`，复制文件 | 否，重跑命令 |
| Cursor 及其他 | skills.sh，复制文件 | 否，`npx skills update` |

### Claude Code

```bash
claude plugin marketplace add PanQiWei/pqw-skills
claude plugin install pqw-skills@pqw
```

### Codex

Codex 读仓库自带的市场清单；插件的展示信息在根 `plugin.json`。

```bash
codex plugin marketplace add PanQiWei/pqw-skills
codex plugin add pqw-skills@pqw
```

### GitHub Copilot，CLI 与 VS Code

```bash
copilot plugin marketplace add PanQiWei/pqw-skills
copilot plugin install pqw-skills@pqw
```

然后在 `~/.copilot/settings.json` 加一次：

```json
{
  "extraKnownMarketplaces": {
    "pqw": { "source": { "source": "github", "repo": "PanQiWei/pqw-skills" }, "autoUpdate": true }
  }
}
```

VS Code 里运行 **Chat: Install Plugin From Source**，填 `https://github.com/PanQiWei/pqw-skills`。

### Kimi Code

仓库根有 Kimi Code 的插件清单 `kimi.plugin.json`。在 Kimi Code 会话里输入：

```text
/plugins install https://github.com/PanQiWei/pqw-skills
```

它会先问一次是否信任这个第三方插件，然后取最新的发行版，复制成托管副本；装完 `/new` 或 `/reload` 生效。技能以 `/skill:pqw-skills:<名字>` 出现。要固定版本，把地址换成发行页，例如 `https://github.com/PanQiWei/pqw-skills/releases/tag/v0.22.2`。更新时重跑同一条命令。

### DeepSeek Harness（DSH）

DSH 没有安装技能的命令，它从固定的目录里发现技能：项目里的 `.dsh/skills` 与 `.agents/skills`，用户级的 `~/.dsh/skills` 与 `~/.agents/skills`。每个技能是这些目录下的一个直属子目录。装到用户级：

```bash
git clone https://github.com/PanQiWei/pqw-skills ~/.pqw-skills
mkdir -p ~/.dsh/skills && cp -R ~/.pqw-skills/skills/. ~/.dsh/skills/
```

更新时在 `~/.pqw-skills` 里 `git pull`，再跑一次第二行。只想装进一个项目，就把目标换成项目根的 `.agents/skills`。只有带技能能力的 profile 会加载它们（终端界面、web、headless、acp、sdk）；`sdk-minimal` 不加载技能。

### Gemini CLI

Gemini 不读 `.claude-plugin`，`--path` 指一个目录。本仓库扁平，一条命令装全套。

```bash
gemini skills install https://github.com/PanQiWei/pqw-skills.git --path skills
```

更新时重跑。

### Cursor、OpenCode、Windsurf、Amp 及其他

走 skills.sh。`-a` 预选宿主，省略则交互选择。

```bash
npx skills@latest add PanQiWei/pqw-skills -a cursor   # cursor、opencode、devin、windsurf、amp、pi
```

更新用 `npx skills@latest update`。它不会带上新增的技能，所以有新技能时重跑 `add`。

只装一个技能：

```bash
npx skills@latest add PanQiWei/pqw-skills --skill=<name>
```

### 本机开发

软链接进本机宿主目录，拉取后即生效：

```bash
bash scripts/link-skills.sh
```

### 外部依赖

本插件不打包 pstack、ub-mode 与 mattpocock/skills，按它们各自的说明安装。

## 写作技能

不属于某个环节，写文档的环节都会用到。

- **[clear-writing](./skills/clear-writing/SKILL.md)**：清晰写作。英文按 ASD-STE100，中文按不依赖语言的清晰性原则；保留含义、情态与必需结构。正文取自上游 asd-ste100-skill 0.4.0（MIT）。项目有自己的文档写作规则时从接入点读，没有时用自带的缺省规则。
- **[write-agents-md](./skills/write-agents-md/SKILL.md)**：撰写与治理 AGENTS.md：创建、修订、压缩、评审或迁移，设计继承的提示作用域，判断内容归属，协调父子文件的重叠与矛盾。

## 仓库结构

见 [STRUCTURE.md](./STRUCTURE.md)。维护规则见 [AGENTS.md](./AGENTS.md)，本机开发与发版步骤见 [DEVELOPMENT.md](./DEVELOPMENT.md)，参与方式见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
