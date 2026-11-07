# 仓库目录结构说明

```
pqw-skills/
├── README.md                 人读的入口：安装方式、技能表、外部依赖表
├── AGENTS.md                 代理读的入口：布局规则与维护规则
├── CLAUDE.md                 只有一行 @AGENTS.md，Claude Code 由此读到 AGENTS.md
├── STRUCTURE.md              本文件
├── CHANGELOG.md              每次改技能行为记一条
├── LICENSE                   MIT
├── .gitignore
├── .claude-plugin/
│   ├── plugin.json           插件清单：名字、版本、skills 数组逐个列出技能目录
│   └── marketplace.json      仓库自带的单插件市场，供 claude plugin marketplace add
├── scripts/
│   └── link-skills.sh        本机开发：把每个技能软链进 ~/.claude/skills 与 ~/.agents/skills
└── skills/
    ├── single-session-dev-flow/   总入口
    ├── requirement-and-invariants/
    ├── domain-impact-analysis/
    ├── tech-research-and-reuse/
    ├── formal-guard/
    ├── detailed-domain-design/
    ├── formal-docs-landing/
    ├── spec-and-plan/
    ├── context-pack/
    ├── delegate-brief/
    ├── one-lesson-rule/
    ├── slice-closeout/
    └── progress-artifacts/
```

每个技能目录只有一个 `SKILL.md`。需要附件时放在同目录，由 `SKILL.md` 链接。

## 与 mattpocock/skills 的差别

| 他的 | 我们的 | 为什么 |
| --- | --- | --- |
| 五个分桶（engineering、productivity、misc、in-progress、deprecated） | 不分桶，`skills/` 下扁平 | 技能数量小，而且它们是一条流上的环节，分桶没有意义 |
| `docs/<bucket>/<skill>.md` 人读页 | 没有，`README.md` 的表就是索引 | 环节的「为什么」写在 `SKILL.md` 里，不维护第二份 |
| changesets 发版流水线 | 手工改 `CHANGELOG.md` 与 `plugin.json` 版本 | 单人维护，少一层工具 |
| `.agents/` 写作约定与 ADR | 规则合进 `AGENTS.md` | 篇幅小，不值得分文件 |
| `ask-matt` 路由技能 | `single-session-dev-flow` 兼任路由 | 流本身就是路由 |
| 用户触发与模型触发两类 | 待定 | 要在正文确认后按环节决定 |

## 技能的两类

- **自定义**：正文在本仓库，例如 `formal-guard`、`one-lesson-rule`。
- **引用外部**：正文只写本仓库的补充，用「调用 Skill 工具加载 `<外部技能>`」指向 pstack、ub-mode、mattpocock 的技能，不复制它们的正文。外部技能的名字和版本登记在 `README.md` 的依赖表。

## 适用范围

总入口技能的第一节就是适用范围：只为复杂系统新增领域、跨多领域纵线交付、子系统重构和较大规模改造而设；小修、原型、小规模增量接口不走，也不走缩水版。

## 流的形状

```
人主导 ───────────────────────────────▶│◀──────────── 代理自主 ────────────▶
1 需求与不变式 → 2 领域影响 → 3 技术复用 │ 7 spec/plan → 8 消熵 → 切片 TDD
→ 4 形式化 → 5 细化设计 → 6 正式落盘     │   → 9 派发 → 11 收口 → 12 汇报
                                       │        ▲ 10 每 45～60 分钟回看 ┘
                              交接点：长期知识进唯一源并过评审
```

## 现在的状态

十三个技能都只有骨架：frontmatter 的名字与触发描述，正文是要点与「待写」。下一步逐环节讨论后补正文。

## 校验

`claude plugin validate .` 通过。带 `--strict` 会失败，原因是两条有意接受的警告：根目录 `CLAUDE.md` 不会随插件分发（它只服务本仓库开发），以及没有插件图标（不打算提交插件目录）。
