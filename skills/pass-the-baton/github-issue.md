# 交棒：用 GitHub issue 协调

设计与交付分在两个会话时的缺省做法。项目接入点「跨会话协调用什么」填了别的工单系统，就用它的对应物：一张工单的正文、评论、开与关。一个会话走完时不开 issue。

## 对应关系

| 交接期的事 | 落在 issue 上是什么 |
| --- | --- |
| 交出一程 | 开一张 issue，正文就是这一程的交接信息包 |
| 路线图 | 设计会话的一张父 issue，正文照路线图模板，任务清单列出各程的 issue 与状态。只有一程时不开 |
| 交付会话开工 | 读自己那张 issue 的正文，和正文链接的 spec 与正式文档。不读父 issue |
| 退包 | 在这张 issue 上评论哪一处答不出或对不上，然后停 |
| 交回 | 在这张 issue 上评论交付声明，带上改动的链接（PR 或提交） |
| 人验收 | 人看评论、上手验；验过了关掉 issue，打回就评论原因，issue 留着 |
| 收回 | 设计会话读这张 issue 的评论与开关状态，更新父 issue 的清单与收回记录 |

一程的状态在 issue 上这样看：

| 状态 | issue 上看得见的 |
| --- | --- |
| 交接中 | 还没有 issue |
| 交付中 | issue 开着，最后一条评论不是交付声明 |
| 已交回，待验 | issue 开着，有交付声明的评论 |
| 打回 | issue 开着，交付声明之后有人的打回评论 |
| 已验收 | issue 关了 |

## 规矩

- issue 正文是包的唯一一份，仓库里不再存一份。要改包，由设计会话改正文，再评论一句改了什么。
- 评论的第一行是固定的开头，收回时按它找：`## 交付声明`、`## 退包`、`## 打回`。
- 没有谁通知设计会话。人验完回到设计会话说一句，设计会话去读 issue。不轮询。

## 命令

`<号>` 是 issue 号。正文与评论先写进系统临时目录的文件，用完删掉。

```bash
# 交出：先核包，再开 issue
node <spec-and-plan 目录>/scripts/check-plan.mjs --handoff <包文件>
gh issue create --title "<一程名>" --body-file <包文件>

# 路线图：开父 issue；收回时整份改正文
gh issue create --title "路线图：<这件事的名字>" --body-file <路线图文件>
gh issue edit <父号> --body-file <路线图文件>

# 交付会话开工：读正文，从标准输入核包
gh issue view <号> --json body -q .body
gh issue view <号> --json body -q .body | node <spec-and-plan 目录>/scripts/check-plan.mjs --handoff -

# 退包、交回、打回：评论第一行是固定的开头
gh issue comment <号> --body-file <评论文件>

# 人验收：验过了关掉
gh issue close <号>

# 收回：读开关状态与评论
gh issue view <号> --json state,comments -q '.state, (.comments[] | .body | split("\n")[0])'
gh issue view <号> --comments
```

父 issue 的任务清单写成 `- [ ] #<号> <一程名>`，验收后改成 `- [x]`。

## 没有 GitHub 时

没有远端，或 `gh` 不可用，又没约定别的：退回到文件。包写成一个文件，交付声明写成它旁边另一个文件，退包与打回也各写一个文件，第一行用上面同样的开头。文件放在接入槽位「交接信息包与路线图放哪」指的地方，没填放项目 tmp 下本程目录。这是兜底，不是默认。
