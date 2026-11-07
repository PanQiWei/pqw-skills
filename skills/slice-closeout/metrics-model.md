# 结构读数与差分变异的模型

与语言无关的定义。自带的工具按这份模型实现，语言适配器只负责把源码变成这里的对象。定义取自 Robert C. Martin 的 crapper 与 mutator（0BSD），计分单元的划分取 omne 的做法。

## 对象

| 对象 | 字段 | 含义 |
| --- | --- | --- |
| 单元 Unit | path、namespace、name、startLine、endLine、startByte、endByte | 一个计分单元：有名字、有函数体的函数或方法。限定名 `namespace.name`。单元之间可以嵌套，行范围内扣掉更内层单元的行才是它自己的行 |
| 判定 Decision | kind | 语法树上使控制流分叉的节点。集合 D 由语言适配器声明 |
| 行命中 LineHits | file → line → (covered, total) | 覆盖率报告里每行的命中。lcov 的 DA 记录是 (hit > 0 ? 1 : 0, 1)，BRDA 记录按行聚合成分支的 (covered, total) |
| 位点 Site | file、unit、line、anchorLine、start、end、original、mutant、category | 一处可替换的文本。anchorLine 是所在语句的起始行，多行语句只有这一行有覆盖记录 |
| 裁定 Verdict | killed、survived、uncovered、notRun(reason) | 一个位点跑完的结果。reason 取 noTests、budget、baselineFailed |

## 定义

- **圈复杂度** `CC(u) = 1 + |{d ∈ D : d 在 u 自己的行内}|`。更内层单元里的判定不算在外层头上。
- **认知复杂度** `CogC(u)` 按 SonarSource 白皮书三条：每个分叉结构 +1；嵌套在另一个分叉结构里的结构再加嵌套深度；同一表达式里逻辑运算符每换一种 +1。适配器声明哪些节点是分叉结构、哪些增加嵌套。
- **覆盖率** `Cov(u) ∈ [0,1] ∪ {null}`。有覆盖报告时：u 自己的行上有分支记录就取分支的 `covered / total`，否则取行记录的 `covered / total`；范围内没有任何记录记 0；文件不在报告里记 0；没有覆盖报告记 null。
- **CRAP** `CRAP(u) = CC² × (1 − Cov)³ + CC`，Cov 为 null 时 CRAP 为 null，报告写「无覆盖」。
- **单元摘要** `Digest(u) = sha256(u 自己的各行去尾部空白后以换行拼接)`。同名单元按行号顺序把各自摘要拼起来再取一次。摘要相同就是函数文本没变，挪位置、上方加行都不算变。
- **改动单元** 基线 ref 到工作树的 diff 碰到的行所在的单元。只认 Git ref，不认任务绑定。

## 变异

- **位点集合** 由适配器按类别生成：relational（`<`↔`<=`、`>`↔`>=`）、equality（`==`↔`!=`、`===`↔`!==`）、logical（`&&`↔`||`、`??`→`||`）、arithmetic（`+`↔`-`、`*`↔`/`）、boolean（`true`↔`false`）、negation（删去一元 `!`）、optional（`?.`→`.`）。只生成改动单元自己的行上的位点。
- **选择** 有覆盖报告时只跑 line 或 anchorLine 被命中的位点，其余裁定 uncovered。有历史时，单元摘要未变且上次 killed 的位点不再跑，沿用上次裁定。
- **运行** 先在未变异的工作树上跑一次测试命令，不通过则整程 notRun(baselineFailed)。每个位点：读原文进内存，写入变异，跑测试命令，还原并逐字节核对。超时按 killed。进程中断时先还原全部已改文件再退出。
- **没跑测试** 测试命令输出匹配「没跑测试」模式时，同一位点按位置复跑一次，仍匹配记 notRun(noTests)。
- **预算** 到时间预算后剩余位点记 notRun(budget)，退出码仍为 0，JSON 标 `budgetExceeded`。
- **分数** `killed / (killed + survived)`，没有已执行的位点时为 null。

## 适配器要给的

| 适配器 | 输出 |
| --- | --- |
| `units(source)` | 单元列表，含每个单元的 CC 与 CogC |
| `sites(source, units)` | 位点列表 |
| `decisions` | 集合 D 的说明，写在适配器文件头 |

TypeScript 适配器：判定集合为 if、三元、for、for-in、for-of、while、do、catch、case、default、`&&`、`||`、`??`、`?.`；有名字的内层函数、对象字面量方法与类字段箭头函数各自成单元，匿名回调并入外层。
