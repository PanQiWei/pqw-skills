---
name: slice-closeout
description: 每个切片实施完成后的收口：走代码评审，用圈复杂度与 CRAP 读数做结构测量与优化，用差分变异检验测试有效性，去 AI slop。一个切片的 TDD 实施完成时加载。
---

# 切片收口

## 动作

- 代码评审。
- 圈复杂度与 CRAP 读数：降复杂度，提覆盖率。
- 差分变异：只打本切片改动的热点。
- 去 AI slop。

## 常驻要求

对自己和派出去的子代理同样要求代码品味、TypeScript 最佳实践、架构优雅与代码整洁。不过度设计，不过度优化。

## 外部技能

- 评审调用 Skill 工具加载 `mattpocock-skills:code-review`。
- 去 slop 调用 Skill 工具加载 `pstack:deslop`。
- 研发品味调用 Skill 工具加载 `ub-mode`。

## 待写
