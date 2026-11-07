## 改了什么

<一两句话。>

## 为什么

<观察到的失败：哪个宿主、哪个技能、什么任务、代理实际做了什么、与期望的差别。>

## 怎样验证

- [ ] `node scripts/check-repo.mjs` 通过
- [ ] `claude plugin validate .` 通过
- [ ] 带与不带这处改动各走了一遍同一程，结果：<>
- [ ] 改了技能行为：`CHANGELOG.md` 已记一条，`.claude-plugin/plugin.json` 的 `version` 已改
- [ ] 增删重命名了技能：`skills/`、`plugin.json`、`README.md` 与 `README_EN.md` 的技能表已同步
