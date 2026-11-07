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
→ 3 技术调研与复用 → 4 形式化守护                │     → 9 派发 → 11 切片收口 → 12 向人汇报 → 13 清理
→ 5 细化领域设计 → 6 正式落盘                   │            ▲                                │
                                              │            └── 10 哨兵定时唤醒，每 45～60 分钟回看 ──┘
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
| 1 | [requirement-and-invariants](./skills/requirement-and-invariants/SKILL.md) | 给用户什么能力，系统前后有什么区别；系统永远要守住什么 | in-your-own-words、grilling |
| 2 | [domain-impact-analysis](./skills/domain-impact-analysis/SKILL.md) | 哪些领域受影响，要不要新领域，谁是重点谁是连带，全局怎么摆 | domain-modeling、principle-model-the-domain、blast-radius |
| 3 | [tech-research-and-reuse](./skills/tech-research-and-reuse/SKILL.md) | 有没有现成的库、相近系统或社区实现可复用，自造的论证是什么 | research、principle-subtract-before-you-add |
| 4 | [formal-guard](./skills/formal-guard/SKILL.md) | 哪些性质靠测试守不住，要靠偏函数全化、数理建模与证明 | create-formal-verification-skill、statechart、maintain-formal-verification-skill |
| 5 | [detailed-domain-design](./skills/detailed-domain-design/SKILL.md) | 领域内部的对象、关系、仓储长什么样，I/O 与查询性能怎么定 | domain-modeling、codebase-design、architect、principle-type-system-discipline、principle-boundary-discipline |
| 6 | [formal-docs-landing](./skills/formal-docs-landing/SKILL.md) | 哪些要长期维护写正式文档，哪些以源码为文档，落在哪一层；五类判据的确定性文档评审 | technical-writing、writing-for-agents |

### 交付期，代理自主

| 环节 | 技能 | 做什么 | 引用 |
| --- | --- | --- | --- |
| 7 | [spec-and-plan](./skills/spec-and-plan/SKILL.md) | 先写 spec 定目标、边界、验收标准，再写 plan 切成有序切片；自带两份模板 | to-spec、to-tickets（读安装路径）、sharpen |
| 8 | [context-pack](./skills/context-pack/SKILL.md) | 整程开工前整理上下文包并做关键环节的细化设计与技术验证；每切片前做开工包：上下文增量、技术设计与验证、细化推进方案、里程碑待办清单 | architect、prototype、principle-guard-the-context-window、recall |
| 9 | [delegate-brief](./skills/delegate-brief/SKILL.md) | 先过派发门，主代理自己做是默认；派时给齐目标、边界、规格、信息包四样东西，交回要原始结果；验收防作弊、升级、合回 | poteto-mode、swarm、principle-separate-before-serializing-shared-state |
| 10 | [one-lesson-rule](./skills/one-lesson-rule/SKILL.md) | 哨兵脚本由宿主原生定时机制唤醒，读 plan 与工作树写增量汇报；主代理每 45 到 60 分钟从顶层回看，子代理每 30 分钟看一次健康度 | recall、show-me-your-work |
| 11 | [slice-closeout](./skills/slice-closeout/SKILL.md) | 每切片收口六步：类型检查与 lint、对照 spec 与不变式、结构读数、差分变异、去 AI slop、证明可用；确定性验收，不做对抗性评审 | code-review、deslop、unslop、principle-prove-it-works、typescript-best-practices、ub-mode |
| 12 | [progress-artifacts](./skills/progress-artifacts/SKILL.md) | 用架构图、UML、快速 demo 等用完即弃的汇报件让人留在高层，放系统临时目录；自带目录脚本与汇报件骨架 | ketchup、prototype |
| 13 | [cleanup](./skills/cleanup/SKILL.md) | 每切片清一次不必留给下一切片的中间产物；一程交付后全盘清理；自带先列后删的清理脚本与交付声明 | 无 |

实施本身走 TDD，不过度设计，不过度优化，由 `pstack:poteto-mode` 与 `mattpocock-skills:tdd` 承载，本仓库不另写。表里的「引用」列是各 `SKILL.md` 当前声明的外部技能；完整的主引用与辅助引用见 [design/skill-mapping.md](./design/skill-mapping.md)。

## 外部依赖

| 技能 | 来源 | 版本 | 本机名 |
| --- | --- | --- | --- |
| poteto-mode、deslop、unslop、create-formal-verification-skill、statechart、maintain-formal-verification-skill、architect、sharpen、recall、show-me-your-work、ketchup、in-your-own-words、blast-radius、swarm、technical-writing、typescript-best-practices 及 principle 系列 | Claude Code 与 Codex 用 [michael-denyer/pstack-claude](https://github.com/michael-denyer/pstack-claude/tree/df9bc05b818e2457ac23d3343e96e4ff284dd9e9/plugins/pstack)；Cursor 用 [cursor/plugins](https://github.com/cursor/plugins/tree/1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def) 的官方 pstack | port 0.9.132；Cursor 0.15.20 | `pstack:<name>` |
| ub-mode | [unclebob/ub-mode](https://github.com/unclebob/ub-mode/tree/3da62bf3f)，只有一份 `SKILL.md`，放进宿主的用户技能目录 | 提交 3da62bf | `ub-mode` |
| to-spec、to-tickets、research、domain-modeling、codebase-design、code-review、tdd、prototype、diagnosing-bugs、grilling、writing-for-agents | [mattpocock/skills](https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills) | 1.3.2，提交 4ae2317 | `mattpocock-skills:<name>` |

引用外部技能的环节只写本仓库的补充，正文里用「调用 Skill 工具加载 `<技能名>`」指向它们。例外是 Matt 的 `to-spec` 与 `to-tickets`：它们声明了 `disable-model-invocation: true`，宿主不让模型用 Skill 工具调用，所以按已安装路径直接读正文，并在报告里写明读取方式。表里的版本是本仓库正文核对过的版本，升级时重新核对被引用的技能有没有改名或改行为。

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
| Gemini CLI | `gemini skills install`，复制文件 | 否，重跑命令 |
| Cursor 及其他 | skills.sh，复制文件 | 否，`npx skills update` |

### Claude Code

```bash
claude plugin marketplace add PanQiWei/pqw-skills
claude plugin install pqw-skills@pqw
```

### Codex

Codex 没有 `.codex-plugin/` 时读 `.claude-plugin/`，同一份清单直接可用。

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

## 元技能

`meta/skills/` 下的 `clear-writing` 与 `write-agents-md` 只给维护本仓库的代理用，不随插件发行。

## 仓库结构

见 [STRUCTURE.md](./STRUCTURE.md)。维护规则见 [AGENTS.md](./AGENTS.md)。

## 状态

0.1.0。十四个发行技能正文齐全，十七份模板、三个脚本随技能目录发行；两个元技能迁自 omne-harness-lite。结构读数与差分变异的可移植工具、HTML 汇报件与 demo 骨架归下一程。
