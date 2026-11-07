# pqw-skills

PanQiWei 与各家 coding agent 协作沉淀出的单会话研发流。一个总入口技能，加上定义期与交付期各环节按需加载的技能。

这条流只用于大改动：复杂系统新增领域、跨多领域的功能纵线交付、子系统重构、较大规模改造。小的缺陷修复、快速原型、小规模增量接口不走它。

## 安装

```bash
claude plugin marketplace add PanQiWei/pqw-skills
claude plugin install pqw-skills@pqw
```

本机开发时用软链接：

```bash
bash scripts/link-skills.sh
```

## 总入口

- **[single-session-dev-flow](./skills/single-session-dev-flow/SKILL.md)**：定阶段、顺序、交接点，指出每个环节加载哪个技能。

## 定义期（人主导）

| 环节 | 技能 | 类型 |
| --- | --- | --- |
| 1 需求与不变式 | [requirement-and-invariants](./skills/requirement-and-invariants/SKILL.md) | 自定义 |
| 2 领域影响与顶层设计 | [domain-impact-analysis](./skills/domain-impact-analysis/SKILL.md) | 自定义，引用 domain-modeling |
| 3 技术调研与复用 | [tech-research-and-reuse](./skills/tech-research-and-reuse/SKILL.md) | 自定义，引用 research |
| 4 形式化守护 | [formal-guard](./skills/formal-guard/SKILL.md) | 自定义 |
| 5 细化领域设计 | [detailed-domain-design](./skills/detailed-domain-design/SKILL.md) | 自定义，引用 codebase-design |
| 6 正式落盘 | [formal-docs-landing](./skills/formal-docs-landing/SKILL.md) | 自定义 |

## 交付期（代理自主）

| 环节 | 技能 | 类型 |
| --- | --- | --- |
| 7 spec 与 plan | [spec-and-plan](./skills/spec-and-plan/SKILL.md) | 引用 to-spec、to-tickets |
| 8 前置消熵 | [context-pack](./skills/context-pack/SKILL.md) | 自定义 |
| 9 派发 | [delegate-brief](./skills/delegate-brief/SKILL.md) | 自定义，引用 poteto-mode |
| 10 定期回看 | [one-lesson-rule](./skills/one-lesson-rule/SKILL.md) | 自定义 |
| 11 切片收口 | [slice-closeout](./skills/slice-closeout/SKILL.md) | 自定义，引用 code-review、deslop、ub-mode |
| 12 向人汇报 | [progress-artifacts](./skills/progress-artifacts/SKILL.md) | 自定义 |

## 外部依赖

| 技能 | 来源 | 本机名 |
| --- | --- | --- |
| poteto-mode、tdd、deslop | pstack | `pstack:poteto-mode`、`pstack:tdd`、`pstack:deslop` |
| ub-mode | 独立技能 | `ub-mode` |
| to-spec、to-tickets、research、domain-modeling、codebase-design、code-review | mattpocock/skills 1.3.1 | `mattpocock-skills:<name>` |

版本与宿主加载方式待在正文确认后钉死。
