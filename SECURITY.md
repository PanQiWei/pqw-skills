# 安全

## 报告

发现安全问题请不要开公开 issue。用 GitHub 的 Security Advisories（仓库 Security 页的 Report a vulnerability）私下报告，或给维护者发私信。我会在七天内回复，修复后在 `CHANGELOG.md` 记一条并致谢报告者。

## 范围

本仓库只有技能正文、模板和三个本机脚本，没有服务、没有网络请求、不存密钥。值得报告的问题是：

- 脚本在不该删的时候删了东西。`skills/cleanup/scripts/cleanup.mjs` 应当默认只列不删，只有 `--apply` 才动手，并跳过主工作树、当前分支、有未提交改动的工作树和没合回的分支。
- 脚本把路径拼到 shell 命令里时没有正确转义。
- 技能正文诱导代理做超出任务边界的动作，例如读写项目外的文件、发外部请求。

## 不在范围

- 外部技能（pstack、ub-mode、mattpocock/skills）的问题去它们的仓库报告。
- 宿主本身的问题去宿主报告。
