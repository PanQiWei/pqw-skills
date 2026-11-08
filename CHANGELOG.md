# pqw-skills

## 0.8.0

第八程：Stryker 成为唯一的变异引擎。`slice-closeout` 的 `mutation.mjs` 删掉内建引擎与它的位点生成、预算、覆盖门控、历史沿用、运行中自适应：`--test`、`--engine`、`--lcov`、`--budget`、`--history`、`--no-tests-pattern`、`--load-ceiling` 退役，给了退出 2 并写原因；项目不是 vitest 或找不到 Stryker 退出 2 并写装法，不再回退。超时复核：第一轮有 Timeout 的变异体时再起一轮，只打它们所在的整行，一个进程、时限放宽（缺省第一轮 `timeoutMS` 的 4 倍且至少 60 秒，`--recheck-timeout` 可改）、不进增量，结果按位点 id 并回（两轮之间 Stryker 重新编号），Killed、Survived 改裁定、原因记 `recheck`，仍超时保持；抬头在计数后写「复核 N（超时转杀死 a、存活 b、仍超时 c）」，JSON 顶层 `recheck`，`--no-recheck` 不起第二轮，第二轮失败写「复核未完成」且第一轮裁定不动。顺手修了单元表没有 `<module>` 时顶层变异体映射崩掉。本仓库自己的测试从 node:test 迁到 vitest（根 `package.json` 钉 vitest 4.1.11、覆盖率插件、Stryker 10.1.1 与 typescript，`npm ci` 后 `npx vitest run`，`--coverage` 出 `coverage/lcov.info`），收口的差分变异由本工具自己跑。量前后（同一仓库、同一范围 `skills/slice-closeout/scripts`）：0.7.0 内建引擎一个切片 106 个位点、15 分钟预算只跑完 36 个；0.8.0 的 Stryker 切片 02 308 个变异体 70 秒分数 90%，切片 03 233 个变异体 47 秒加复核 43.5 秒分数 89%，复核 1 仍超时 1。命令面文件只在子进程里跑，Stryker 与 lcov 都看不见它的覆盖，一多半变异体无覆盖：命令面要薄、逻辑进 lib。`metrics-model.md`「变异」「资源」两节只写一种引擎，`slice-closeout/SKILL.md` 第 4 步、两处接入槽位、DEVELOPMENT、STRUCTURE、两份 README 同步。

## 0.7.0

第七程：差分变异换 Stryker 引擎，用 vitest 的项目一轮耗时从「位点数乘整套测试一遍」降到「初跑一遍加每个变异体只跑碰到它的用例」。`slice-closeout` 的 `mutation.mjs` 多 `--engine auto|stryker|builtin`（缺省 auto）与 `--stryker-modules <目录>`（也读 `PQW_STRYKER_MODULES`）：项目有 vitest 配置或声明了 vitest、且按「项目根 node_modules、指定目录、技能 `scripts/node_modules`」的顺序找得到 `@stryker-mutator/core` 与 vitest runner 时用 Stryker 引擎，否则用内建引擎，抬头在基线说明之后写一行「引擎：Stryker <版本>（vitest）」或「引擎：内建（<原因>）」，JSON 顶层加 `engine`；显式要 Stryker 而条件不满足退出 2 并写装法。新 `scripts/lib/stryker.mjs`：范围变 `mutate` 条目（改动行所在单元自己的全部行写成 `路径:起-止`，与内建引擎的范围一致；点名文件整份）与配置（vitest runner、`related: false`、逐条覆盖、并行度写进 `concurrency`、JSON 报告器），在项目根起 Stryker，输出进系统临时目录工作目录的日志、进度行转到标准错误，读 JSON 报告映射回同一个位点模型（单元按行找、原文按位置切、类别取变异器名去后缀；Killed→杀死、Timeout→杀死（timeout）、Survived→存活、NoCoverage→无覆盖、RuntimeError 等→未跑带原因），抬头、表格、存活清单、测量无效、未覆盖段与 JSON 字段两种引擎一致。Stryker 引擎不改项目文件，只写 `.stryker-tmp`（没被项目忽略时抬头提醒；跑完删，被 SIGINT、SIGHUP、SIGTERM 结束也删，只有被强杀时留下）与系统临时目录；报告里出现映射表没有的状态时测量无效；`baseline.seconds` 是初跑用时，从 Stryker 日志取；初跑失败退出 1，抬头写「测量无效（Stryker 初跑失败）」并给日志尾；`--test` 可省略，`--budget` 不适用（抬头写明）。增量：配置开 `incremental`，增量文件与指纹记录（工具版本、「vitest@<版本> + <配置文件>」、测试文件摘要、Stryker 版本）在工作目录，指纹变了 `force` 整轮重跑，抬头写「沿用 N」或「增量：已开，本轮没有沿用」，`--history` 在 Stryker 引擎下写不适用。依赖钉在 `skills/slice-closeout/scripts/package.json`（Stryker 10.1.1、vitest-runner 10.1.1、vitest 4.1.11、typescript 6.0.3），`npm ci --prefix` 装到技能目录，`check-repo` 的扫描跳过 `node_modules`。量前后（同一基线、同一范围，三条用例的 vitest 小项目改两行）：内建 5 个位点 3.5 秒分数 40%，Stryker 20 个变异体 4.3 秒分数 75%（增量第二轮 2.6 秒、沿用 20）；小项目上两种引擎耗时相当，差距随测试时长与位点数放大：本仓库自己整套测试约 50 秒，一个切片 106 个位点内建引擎 15 分钟只跑完 36 个。两种引擎的变异器不同，位点数与分数不能跨引擎比。本仓库自己的测试仍是 node:test，自跑用内建引擎。第六程顺手的优化：汇报件渲染「一程目标与前后差别」节开头的说明段；哨兵在 `check-plan` 给出结果时不再重复报「处置编号断号」；plan 模板进度更新规则第 7 条「时刻取自时钟」；`spec-and-plan` 正文写改文件先读后写。`metrics-model.md`「变异」「资源」两节、`slice-closeout/SKILL.md` 第 4 步、两处接入槽位、DEVELOPMENT、STRUCTURE、两份 README 同步。`tests/` 120 个用例，真起 Stryker 的用例在 `PQW_STRYKER_MODULES` 指向装好的模块时执行。

## 0.6.0

第六程：plan 与汇报件讲人话，文档不过期。plan 模板多两层给人读的叙述：开头一节「一程目标与前后差别」，产品层写用的人得到什么、以前为什么不顺、现在怎样，技术层写系统哪一块的工作方式变了、以前怎么跑现在怎么跑；每个切片一项「交付这片的意义」，分对用户与对系统两句。写法是展开的完整句子，不缩略，术语第一次出现要解释。plan 多一节「文档维护表」：一程里每份给人看的文档给谁看、什么时候更新、只动哪一节、怎么判断过期、最近更新；两条新规则：结构是契约、更新一律局部编辑不整份重写，每次更新文档改维护表该行的最近更新。`spec-and-plan` 新脚本 `check-plan.mjs` 按模板核 plan 与 spec 的骨架（必需节与顺序、进度行与处置行格式、切片表与维护表表头、每片的意义段与开工包与收口、处置编号连续），退出 0/1/2 并逐条列「文件:行 缺陷」，收口最后一步、哨兵每轮、汇报件生成前各跑一次。哨兵脚本 `sentinel.mjs` 多算「文档陈旧」信号：进度行 head 不是 HEAD、处置断号、汇报件早于最近提交、plan 结构不合模板、维护表某行最近更新落后而最近提交改了它，汇报多一节「文档」；回看记录、哨兵简报与正文的四问变五问「给人看的文档有没有过期」。汇报件 `build-report.mjs` 把 plan 的两层叙述渲染到网页开头「这程为什么做」，切片行下面带该片的意义，顶部写结构核对结果；plan 没写时写明而不是留空。收口清单最后一步改成「按文档维护表逐份核对并更新，跑 check-plan」。`tests/` 101 个用例。

## 0.5.0

第五程。读数口径：测试文件与声明文件不进改动函数表，列进「未覆盖的改动文件」带原因；覆盖率三态（有值、未提供、无数据），`coverage` 为 null 时带 `coverageReason`，不再把「不知道」写成 0；报告里找文件照 crapper，全等优先、整段后缀匹配恰一个才取，多个候选不猜；抬头与 JSON `warnings` 记三条可信度警告：报告早于改动文件、改动函数全部零命中、多个文件匹配。与基线比：每个改动函数带基线版本的圈复杂度与认知复杂度和趋势（new、up、down、same），变差 = 过线且 new 或 up；表格全列、变差标「!」排前，表尾写「要交代 n 个变差；另有 n 个过线但没有变差，照列不解释」，`slice-closeout` 正文与收口清单改成只逐条交代变差的。变异不说错：基线不通过或一个位点都没执行时 `valid` 为 false，抬头写「测量无效（原因）」且不出四类计数；改动了却没有位点的段（模块级语句、没有可替换位点的单元）单列「没有位点的改动段（不进分数）」，空行与注释行不算。历史沿用：位点 id 改为 `文件:单元:单元内偏移:类别:替换`，文件上方加行不影响沿用；结果 JSON 带 `fingerprint`（工具版本、测试命令、测试文件摘要），历史的指纹任一项不同或没有指纹整份不沿用并写明原因，抬头写「沿用 N」；新 `scripts/lib/version.mjs` 的 `TOOL_VERSION` 由 `check-repo` 第 7 段核与 `plugin.json` 一致。改写保护：写入变异体前先把原文与变异体落到系统临时目录的还原日志，还原后删，被 SIGKILL 或断电留下的日志在下次启动先还原并打印，文件在那之后被人改过就不覆盖、退出 1；写入前核文件仍是原文、还原前核文件仍是变异体，不是就不覆盖，打印「文件在变异期间被改动」退出 1；SIGHUP 与 SIGINT 一样先还原，退出 129。热点点名：`--files <路径,…>` 让点名文件的全部有名单元出位点，不论改没改，抬头写「（点名 N 个文件）」，位点带 `pinned`；`slice-closeout` 第 4 步写修复轮用 `--base <上一轮收口头>` 收窄、判据与状态机文件用 `--files` 点名，接入槽位两行同步。汇报件 `report.mjs` 函数表加带位、原 → 现、变差三列，变异段写测量无效、超时与未覆盖段。`tests/` 91 个用例。

## 0.4.0

第四程。哨兵改成便宜档的只读子代理：持有 spec、plan 与整程上下文包，每 45 分钟自己醒来取工作树事实，判偏离、兜圈、腐化与子代理健康，写回看记录并给主代理发十行以内的消息，主代理在停顿点写「处置 n」回 plan；`one-lesson-rule` 正文、`hosts.md` 三宿主派法（Claude Code 一条在本程真实验证）、回看记录模板、`delegate-brief` 的哨兵简报模板与 `scripts/sentinel.mjs` 的增量摘要和无处置信号一起落地。技能正文宿主无关：35 处「调用 Skill 工具加载」改成「加载技能」，`check-repo` 反向核宿主工具名，只有 `hosts.md` 例外。差分变异有了资源模型：按 CPU 数、可用内存与 `--other-heavy-tasks` 算份额与并行度，交给测试命令的 `PQW_TEST_WORKERS` 与 `VITEST_MAX_WORKERS`，子进程 nice 10，运行中按负载比降升档并记机器繁忙，JSON `resources` 节记容量、份额、自适应与自身开销，`--help` 是教程。读数可信：纯删除也算改动行，显式基线不是 HEAD 祖先时改用合并点并记 `baseGiven`，git 只认 `--repo`；「没跑测试」模式带词界并在基线上自检，被信号结束记 notRun(crashed)，类型位置不出位点，超时单列，存活清单只陈述事实；认知复杂度链尾 else 补记 1，适配器头注释钉上 crapper 6fd92c4 与 mutator a5a0cb8，读数每个函数带 `band`（缺省 CC 10/12、CRAP 30，`--cc`、`--crap` 可覆盖），JSON 记 `thresholds`。`tests/` 76 个用例。

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
