# 本机开发

本文件讲怎样在本机改、验、发这套技能。参与规则归 [CONTRIBUTING.md](./CONTRIBUTING.md)，布局与写作规则归 [AGENTS.md](./AGENTS.md)。

## 前提

- Node 20 以上。脚本都是无依赖的 ESM，直接 `node` 跑，仓库不装 npm 包。
- 至少一个宿主：Claude Code、Codex 或 Cursor。校验插件清单需要 Claude Code 的 `claude` 命令。
- 外部技能已按各自说明装好：pstack、ub-mode、mattpocock/skills。版本见 `README.md` 的依赖表。`scripts/check-repo.mjs` 会读本机安装目录核对引用，没装会报「无法核对」。

## 链接进宿主

```bash
bash scripts/link-skills.sh
```

把 `skills/*` 与 `meta/skills/*` 软链进 `~/.claude/skills` 与 `~/.agents/skills`。增删重命名技能后重跑。链接后宿主新开会话即可看到技能；已经开着的会话不会重新加载。

## 一致性检查与测试

```bash
node scripts/check-repo.mjs
claude plugin validate .
PQW_TS=<typescript 包目录> node --test tests/
```

`tests/` 用 `node:test`，夹具在系统临时目录建小 Git 仓库。需要 typescript 的用例从 `PQW_TS` 取包目录（要 JS 实现的 typescript，6.x 可用），取不到就跳过并打印原因。差分变异的用例要跑真实的测试命令，整套约一分钟。

第一条核：`skills/` 扁平布局、frontmatter、无「待写」、三处同步、外部引用在钉定版本里存在、DMI 技能的措辞、发行技能、模板、脚本与网页里无项目概念禁词、全仓散文与脚本无破折号（`tests/` 与 `check-repo.mjs` 自身免检）、模板被 `SKILL.md` 链接。退出 0 通过，1 列出失败，2 用法错误。

第二条校插件清单。不用 `--strict`：它把根目录 `CLAUDE.md` 不随插件分发、没有图标这两条有意接受的警告算失败。

## 跑脚本

三个发行脚本各自 `--help`，并各跑一次真实运行：

```bash
node skills/progress-artifacts/scripts/artifacts-dir.mjs --help
node skills/one-lesson-rule/scripts/sentinel.mjs --plan tmp/<一程>/plan.md --interval 2s --once
node skills/cleanup/scripts/cleanup.mjs --scope slice --prefix <前缀> --plan
```

清理脚本默认只列不删，只有 `--apply` 才动手。哨兵的宿主接法见 `skills/one-lesson-rule/hosts.md`。

## 改流程图

`assets/flow.svg` 是手写 SVG，带深色模式样式。改完本地看一眼：

```bash
<chromium> --headless --no-sandbox --disable-gpu --hide-scrollbars --window-size=1100,620 --screenshot=/tmp/flow.png file://$PWD/assets/flow.svg
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

1. `CHANGELOG.md` 加一条，`.claude-plugin/plugin.json` 改 `version`，两处一起改。版本号变了托管路线才会重装。
2. `README.md` 与 `README_EN.md` 的徽章与「状态」节同步版本。
3. 两条检查通过后提交，打 tag `v<版本>`。
