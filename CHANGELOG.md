# pqw-skills

## 0.3.1

第三程。四个 CLI（`metrics.mjs`、`mutation.mjs`、`build-report.mjs`、`demo-append.mjs`）的逻辑拆进各自 `scripts/lib/` 的具名函数，命令面只剩参数、装载、信号与退出码，模块级圈复杂度从 17 到 74 降到 7 到 8；行为逐字节不变，原用例未改。拆完用变异工具打自己：三组 lib 的分数 97%、90%、83%，存活项逐个写了等价说明。新增 `tests/*-lib.test.mjs` 直打函数的用例，共 51 个。`check-repo.mjs` 的禁词与破折号扫描扩到 `.mjs` 与 `.html`（`tests/` 与它自身免检）。适配器 `sites` 补一条用例：只有逻辑非是 negation 位点。`DEVELOPMENT.md` 写上覆盖率与自量命令。

## 0.3.0

第二程。`slice-closeout` 自带结构读数与差分变异工具：先写与语言无关的模型 `metrics-model.md`（单元、判定、覆盖、CRAP、位点、裁定，取自 unclebob/crapper 与 mutator，0BSD），核心 `lib/core.mjs` 只认模型对象，`lib/adapter-typescript.mjs` 把 TypeScript 与 JavaScript 源码变成单元与位点。`metrics.mjs` 只摘改动函数的圈复杂度、认知复杂度与 CRAP，基线只认 Git ref；`mutation.mjs` 只打改动单元的位点，覆盖门控、历史沿用、时间预算、「没跑测试」复跑、SIGINT 还原。`progress-artifacts` 自带 `build-report.mjs` 网页汇报件与 `demo-append.mjs` 增量 demo。新增 `tests/`。接入槽位的「结构读数」「差分变异」两行改为只填覆盖率文件、测试命令与范围。已知整理项：三个 CLI 的逻辑写在模块层，模块级圈复杂度 67 到 74，下一程拆成函数。

## 0.2.0

新增 `teach-pqw-skills`：教人用这套流的技能，自带心智模型与哲学、谁做什么、提示怎么写三份参考。全部 description 按 pstack 与 Matt 的指针写法重写：环节号领头、人会说的原话作触发、一条不加载、容易混的互指，学习结论在 `design/description-and-entry-study.md`。入口技能加开工动作：复述目标、把 13 个环节写进会话任务清单并给跳过留理由、「新任务」重判；规则按主题分组，末尾加容易混的环节。

仓库文档：README 的流程图改为 `assets/flow.svg`，加徽章；新增 `README_EN.md`、`CONTRIBUTING.md`、`DEVELOPMENT.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md` 与 `.github/` 的 PR、issue 模板。技能行为无变化，版本不动。

## 0.1.0

第一程：十四个发行技能补全正文；十七份模板与三个脚本（哨兵、汇报件目录、清理）随技能发行；`clear-writing` 与 `write-agents-md` 两个元技能迁自 omne-harness-lite；新增 `scripts/check-repo.mjs` 一致性检查。确定性验收品味写进收口、落盘与派发三个技能，不做对抗性评审。外部依赖钉 pstack 0.9.132、Matt 1.3.2、ub-mode 3da62bf。本程自身按这条流 self-dogfood，spec 与 plan 用本仓库模板写成。

## 0.0.0

初始化：总入口技能与十三个环节技能的骨架，另有两个元技能，正文待逐环节确认。
