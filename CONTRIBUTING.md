# 参与贡献

感谢你愿意改进这套技能。本文件讲怎样提问题、怎样改技能、怎样开 PR。仓库的方法论、布局规则与写作规则归 [AGENTS.md](./AGENTS.md)，本机开发与发版步骤归 [DEVELOPMENT.md](./DEVELOPMENT.md)，这里不重复。

## 先说清楚改的理由

改一个技能的唯一好理由是某次真实会话里代理走偏了、漏了或绕了。开 issue 或 PR 时写清三件事：

1. 哪个宿主、哪个技能、什么任务。
2. 代理实际做了什么，与期望的差别是什么。
3. 改完后这种失败怎样被防住。

「这样写更完整」「顺手补一句」不是理由。没有观察到的失败，先开 issue 讨论，不直接改正文。

## 先问改的是哪一层

| 要改的 | 去哪里 |
| --- | --- |
| 流的顺序、交接点、某环节该加载哪个技能 | `skills/single-session-dev-flow` |
| 某个环节的做法、模板、脚本 | 该环节的技能目录 |
| 外部技能（pstack、ub-mode、mattpocock/skills）的行为 | 去它们的仓库提，这里不打补丁复制一份 |
| 维护本仓库的写作与 AGENTS 规则 | `meta/skills/` |

改错层的典型症状是入口技能越写越厚，或者两个环节技能互相复制。

## 改动的纪律

- 一次只改一处。改完后用同一程任务带与不带这处改动各走一遍，留好的那个，并在 PR 里写比较结果。
- 不松动流的不变量：定义期顺序、交接点的物理条件、派发四要素、定时回看。
- 验收是确定性的：测试、形式化证明、对照已写明的 spec。不做对抗性评审，也不往技能里加对抗性评审。
- 不新增仓库级机制。单人维护，少一层工具胜过多一层自动化。
- 遵守 [AGENTS.md](./AGENTS.md) 的写作规则：中文正文，专有名词保留原文，不用破折号，不写工作日志式句子。

## 增删或重命名技能

同步三处：`skills/` 目录、`.claude-plugin/plugin.json` 的 `skills` 数组、`README.md` 与 `README_EN.md` 的技能表。`node scripts/check-repo.mjs` 会核对前三处。

## 开 PR 前

```bash
node scripts/check-repo.mjs
claude plugin validate .
```

两条都要通过。改了技能行为就在 `CHANGELOG.md` 记一条并改 `.claude-plugin/plugin.json` 的 `version`，两处一起改。PR 模板会列出这些项。

## 提交信息

一行主题，`<类型>: <做了什么>`，类型用 `feat`、`fix`、`docs`、`chore`。正文写理由，不写过程。提交不带代理署名。

## 讨论与行为

问题与建议走 GitHub Issues，模板在 `.github/ISSUE_TEMPLATE/`。安全问题按 [SECURITY.md](./SECURITY.md) 私下报告。参与者遵守 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。
