# pqw-skills

## 0.12.1

第十三程：pnpm 多包仓库（omne-harness-lite）上试用 0.12.0 时发现的五处缺陷，每处一条先红后绿的用例。一、大仓库：`sh()` 用 `execFileSync` 跑 git，缺省 `maxBuffer` 是 1 MB，`changedLines` 对整个仓库跑 `git diff`，基线往前几个提交（跨过几次合并）就报 `ENOBUFS`，结构读数与差分变异都崩。现在缓冲上限是 1 GiB；给了 `--scope`（差分变异再加 `--project`）时，范围作为 pathspec 交给 `git diff` 与未跟踪文件的列表，只取需要的部分；`--scope` 仍是字符串前缀，pathspec 把前缀转义后补 `*`，读出之后照旧按前缀过滤，口径不变。差分变异的「成员外改动 N 个文件」另取文件名（`git diff --name-only`，输出很小）来数，不因收窄而变。二、Stryker 找不到 runner：被测项目用 pnpm 装 Stryker 时（隔离布局，`node_modules/.pnpm/...`），Stryker 只在 `@stryker-mutator/core` 真实位置旁边找 `@stryker-mutator/*` 插件，找不到 vitest runner，初跑失败（`Cannot find TestRunner plugin "vitest"`）。现在工具写配置时用已解析到的 runner 入口文件的绝对路径写 `plugins: [<路径>]`（Stryker 对绝对路径走 `import()`，所以写入口文件，不是包目录），入口取包的 `exports` 的「.」项，没有取 `main`。三、typescript 7：结构读数与差分变异用 typescript 的 JS 接口按行找函数，7 起是原生实现，npm 包里没有 JS 接口；成员里有 7.0.2、pnpm 存储里有 6.0.3 时每次都得 `--ts` 指过去。现在没给 `--ts` 时依次找 Git 根（含往上各级）、`--project` 成员目录（只有差分变异有这个选项）、Git 根的 `node_modules/.pnpm/typescript@*/node_modules/typescript`，每处只收有 JS 接口的，存储里按数字分量取最高版本；没有接口的记下继续往后找，不拦住后面的候选（成员里装的是 7.x、存储里有 6.x 时才能自动找到），都没有时退出 2，消息写出找到的路径与版本，说明用 `--ts` 指到一个 6.x。四、覆盖率报告：被测成员下生成了 `coverage/` 的 HTML 报告（`prettify.js` 等）又没被 `.gitignore` 忽略时，结构读数把它们当成改动文件。现在改动文件缺省排除任意层级的 `coverage/` 目录（已跟踪的也不算，目录名只是带 coverage 的不排除），`metrics-model.md` 写明覆盖率报告应写到工作树之外或只用 `lcovonly`。五、`check-plan --handoff`：四问的答案写成 `<待只读核对后填>` 仍退出 0，按 0.11.0 占位算没答，实际只认字面的 `<>`；起点一行把分支和提交号写在反引号里报格式错，报错也没给正确写法。现在整条答案是 `<...>` 形式都算没答（答案里夹着尖括号的不算占位）；起点一行容许分支与提交号各自带一对反引号，报错消息改为「起点一行应为「- 起点：<分支>@<提交号>」，提交号至少 7 位十六进制；分支与提交号可各自带反引号，例如「- 起点：main@0123abc」」。`metrics-model.md` 与两处 `--help` 同步。`tests/` 138 个用例（0.12.0 是 118，新增 20）；真起 Stryker 的 pnpm 布局用例用复制出来的核心造一个核心旁边没有 runner 的存储，修前报 Cannot find TestRunner plugin "vitest"。

## 0.12.0

第十二程：差分变异支持多包仓库。以前 `mutation.mjs` 只认 Git 根下的一个 vitest 项目，在根下起 Stryker；pnpm 一类多包仓库的根下常常没有 vitest 配置，每个成员各有一份，工具一跑就退出 2。现在给 `--project <成员目录>`（Git 根相对或绝对路径，须在根内、是目录）就在成员里认 vitest、找依赖（成员 `node_modules`、Git 根 `node_modules`、`--stryker-modules`、技能目录依次找）、起 Stryker，工作目录与增量指纹按成员；改动行照旧从 Git 根算，只收成员下的文件，抬头写「项目：<成员目录>」，成员外的改动写「成员外改动 N 个文件，不在本轮」。路径只在 Stryker 边界换算：写配置时 `mutate` 去掉成员前缀，读报告时给文件键加回前缀；抬头、表格、存活清单与 JSON（含 `mutate`）的路径都相对 Git 根，JSON 顶层多 `project`（不给为 null）。改动跨几个成员时由调用方按成员各调一次。成员在 Git 根下两层及更深时，Stryker 的容器放成员上两级、名为 `.stryker-tmp-<成员目录>-<8 位散列>`，沙箱与成员同深度，成员配置与用例里往上走两层及以上的相对路径在沙箱里照样成立，几个成员同时跑也不撞名；只深一层时容器放根下，抬头提醒沙箱深一层；容器跑完与收到信号时都删，没被忽略时提醒按实际名字写。成员的用例导入自己的构建产物（如 `dist/`）时给 `--build-command <命令>`：Stryker 10.1.1 建沙箱是复制文件、跑构建、再链 `node_modules`，构建时还没有依赖，所以工具关掉 Stryker 的链接，把自带的 `scripts/sandbox-build.mjs` 写成 `buildCommand`，它先把成员的 `node_modules` 链进沙箱，再经 shell 跑给的命令；构建失败退出 1，抬头写「测量无效（构建失败）」，JSON `baseline.buildFailed`。不给这两个选项时行为与 0.11.0 一样。不给 `--build-command` 时由 Stryker 链 `node_modules`，它只链实目录，整个 `node_modules` 是软链时链不进去；给了时包装脚本只链项目顶层的那一个；`metrics-model.md` 写明。`slice-closeout` 第 4 步、`metrics-model.md`「变异」一节与接入槽位「差分变异」一行三处同步。omne 那套工具里另外几条与多包无关的修正（关 vitest `preParse`、沙箱预检文件级失败、拦 Stryker 对拒绝的重试）不在本版。`tests/` 118 个用例。

## 0.11.0

第十一程：交接点可以跨会话，十条中心思想进教学技能。以前入口「边界」写着这条流只服务一个会话，定义期和交付期默认在同一个会话里走完，交接点核对单的四问只在定义期末尾自问，答案没有落成能交给别人的东西。现在定义期与交付期可以在两个会话里顺序完成：设计会话在交接点核对单过了之后，照新模板 `single-session-dev-flow/handoff-pack-template.md` 写一份交接信息包，九节（目标、依据、不变式、验收标准、边界、起点与风险、已定事项、只有人能定的待决、四问），只放钉在一个提交上的正式文档指针和当场可核的几项，四问的答案写在包里；交付会话从包开工，开工动作第 4 条写先核包、对照包答四问、从第 7 步开工，包里答不出的地方就地提问、其余先做。仍不做多会话并行协作。接入槽位多一格「交接信息包放哪」，没填时放项目 tmp 下本程目录的 `handoff.md`，上下文包模板、教学技能与设计文档三处同步。`check-plan` 多 `--handoff <文件>`：核抬头、九节在且顺序对、起点一行是「分支@至少七位十六进制提交号」、四问四条都有答案（`<>` 占位算没答），缺陷格式与退出码和 `--plan`、`--spec` 一样，三个选项可以任意组合，至少给 `--plan` 或 `--handoff`；用例把模板实例化后核一次，模板与核对器钉在一起。`teach-pqw-skills/mental-models.md` 末节「AI 主导研发交付的心智」：出自 Anthropic 2026 年 10 月的两篇文章，主线是人主导时的流程防人、AI 主导时的流程要防代理，十条讲人的注意力最贵、按失败模式配检查、防代理的检查留而协调物件删、风险由改动决定、人做五件事、审查前移且两轮封顶、合入前只拦确定性检查并跑在合并结果上、合入后靠回退兜底、少全局状态少分支、教训进结构；写代码那一层链到入口的四条，不另写。`tests/` 101 个用例。

## 0.10.0

第十程：写代码的四条进入口。ub-mode 的核心心智以前散在五处、每处半句，而且都离入口远：「先做对再做好」在收口技能里，实现写完才读到；「做好」没有单独一轮的位置；「需要优化时不回避」没有写；「找本质解」只在哨兵报警时出现；派出去的写者一条都看不到。现在 `single-session-dev-flow` 开头一节「写代码的四条」是唯一正文：先做对；再做好一轮（不加能力，只改实现，spec 写明的性能要求不退化）；不过度设计、不提前优化，但 spec 有性能要求或测量显示不满足时优化属于做对；找本质解（同一前提下两次修补都失败就写出前提并推翻它，切片做久了先怀疑建模）。入口的 description 追加一句点出四条，宿主注入技能描述时就看得到，加载条件不变。切片循环写成开工包、做对、做好一轮、收口、汇报、切片清理；plan 模板的开工包与收口、开工包模板、收口记录模板各有「做好一轮」一项；`check-plan` 多一类缺陷「切片 NN 收口缺「做好一轮」」，所以 0.9.0 及以前写的 plan 会各报若干条，补一行即可。第四条接到两个出口：哨兵判「局部兜圈」时结论带固定提醒，`slice-closeout` 的两轮不收敛与 `delegate-brief` 的升级都先按第四条做；简报模板「规格」节要求把四条原文贴给写者。其他提到这几条的地方（`slice-closeout`、`teach-pqw-skills` 四处、spec 模板）改成一句加链接，`check-repo` 第 8 段核：入口以外的技能正文里提到「先做对」「再做好」「找本质解」的行必须链到入口那一节。`tests/` 98 个用例。

## 0.9.0

第九程：收尾小事。结构读数多两处看得见：改动的测试文件里改动行所在、回调体内没有断言调用的用例列在表后一节「没有断言的用例」，JSON `testsWithoutAssertions`，用例认 `test`／`it` 链的调用、断言认被调用者最左标识符匹配 `^(assert|expect)$`，`--assert-pattern` 可换，认法只在 TypeScript 适配器里；只改了顶层声明、改动行不在任何函数里的源码文件进「未覆盖的改动文件」，原因写明。插件校验的两条警告（根 `CLAUDE.md` 不作插件上下文、没有图标）在 DEVELOPMENT 写成预期并给了理由；旧引擎的 `TRIVIAL_LINE_RE`、`--no-tests-pattern` 实现与 SIGINT 用例已随 0.8.0 删除，本程只确认残留为零。

## 0.8.0

第八程：Stryker 成为唯一的变异引擎。`slice-closeout` 的 `mutation.mjs` 删掉内建引擎与它的位点生成、预算、覆盖门控、历史沿用、运行中自适应：`--test`、`--engine`、`--lcov`、`--budget`、`--history`、`--no-tests-pattern`、`--load-ceiling` 退役，给了退出 2 并写原因；项目不是 vitest 或找不到 Stryker 退出 2 并写装法，不再回退。超时复核：第一轮有 Timeout 的变异体时再起一轮，只打它们所在的整行，一个进程、时限放宽（缺省第一轮 `timeoutMS` 的 4 倍且至少 60 秒，`--recheck-timeout` 可改）、不进增量，结果按位点 id 并回（两轮之间 Stryker 重新编号），Killed、Survived 改裁定、原因记 `recheck`，仍超时保持；抬头在计数后写「复核 N（超时转杀死 a、存活 b、仍超时 c）」，JSON 顶层 `recheck`，`--no-recheck` 不起第二轮，第二轮失败写「复核未完成」且第一轮裁定不动。顺手修了单元表没有 `<module>` 时顶层变异体映射崩掉。本仓库自己的测试从 node:test 迁到 vitest（根 `package.json` 钉 vitest 4.1.11、覆盖率插件、Stryker 10.1.1 与 typescript，`npm ci` 后 `npx vitest run`，`--coverage` 出 `coverage/lcov.info`），收口的差分变异由本工具自己跑。量前后（同一仓库、同一范围 `skills/slice-closeout/scripts`）：0.7.0 内建引擎一个切片 106 个位点、15 分钟预算只跑完 36 个；0.8.0 的 Stryker 切片 02 308 个变异体 70 秒分数 90%，切片 03 233 个变异体 47 秒加复核 43.5 秒分数 89%，复核 1 仍超时 1。命令面文件只在子进程里跑，Stryker 与 lcov 都看不见它的覆盖，一多半变异体无覆盖：命令面要薄、逻辑进 lib。哨兵多一问「实现是不是比本质复杂」：切片用时超预算、同一切片提交过多、新函数读数变差或改动面远大于交付的一句时，消息带一行固定提醒，各切片的实现本质上都简单，做久了是没找到本质解，先问过度设计、不优雅、缺的数理建模、形式化建模、领域设计、OOP 建模（SOLID）；主代理多一个出口「回到建模」。`cleanup` 正文重写：清理只判断还要不要，不要的直接删、要的原地留，Git 历史与汇报件就是留痕，所以不打包、不在文档里写「待删」「已删」、不先汇报再删；清单模板收成一程交付声明五项，`slice-closeout` 的收口清单与正文同口径。`metrics-model.md`「变异」「资源」两节只写一种引擎，`slice-closeout/SKILL.md` 第 4 步、两处接入槽位、DEVELOPMENT、STRUCTURE、两份 README 同步。`tests/` 91 个用例，`npm ci` 后不设环境变量全部执行。

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
