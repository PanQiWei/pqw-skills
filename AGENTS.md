# pqw-skills 的代理入口

这个仓库沉淀 PanQiWei 与 Claude Code、Codex、Cursor 等 coding agent 协作的单会话研发流。它是扁平的：`skills/` 下一个总入口技能加若干环节技能，没有分桶。

## 布局规则

- `skills/single-session-dev-flow/` 是总入口。它只定阶段、顺序、交接点，和每个环节加载哪个技能，不写环节的做法。
- 其余每个 `skills/<name>/` 对应一个环节。环节技能分两类：自定义的，正文在本仓库；引用外部的，正文只写本仓库的补充与「调用 Skill 工具加载 `<外部技能>`」，不复制外部正文。
- 外部技能的名字与版本登记在 `README.md` 的依赖表。改引用先改那张表。
- 每个技能在 `.claude-plugin/plugin.json` 的 `skills` 数组有一项。增删技能同步三处：目录、这个数组、`README.md` 的技能表。
- 技能名用英文短横线，正文用地道中文。专有名词保留原文，普通技术名词用中文。
- 全仓库散文不用破折号。

## 维护

- 改技能行为后在 `CHANGELOG.md` 记一条，改 `plugin.json` 的 `version`。
- `scripts/link-skills.sh` 把每个技能软链进 `~/.claude/skills` 与 `~/.agents/skills`，拉取后即生效。增删重命名后重跑。
- 改清单后跑 `claude plugin validate .`。不用 `--strict`：它把根目录 `CLAUDE.md` 不作为插件上下文、以及没有图标这两条警告算失败，这两条是有意接受的。
