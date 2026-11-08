// 直接打 lib/mutation.mjs 的函数：时长、可打的文件、汇总与表格。执行层的用例随内建引擎在 0.8.0 删除，见 tests/stryker*.test.mjs。
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { score } from "../skills/slice-closeout/scripts/lib/core.mjs";
import { parseDuration, isMutable, summarize, formatMutation } from "../skills/slice-closeout/scripts/lib/mutation.mjs";

const site = (over) => ({ id: "a.ts:1:0:logical", file: "a.ts", unit: "f", digest: "d1", line: 1, anchorLine: 1, start: 2, end: 4, original: "&&", mutant: "||", category: "logical", verdict: "planned", reason: null, runs: 0, seconds: null, ...over });

test("时长：无单位按秒，ms s m h，没给用缺省，格式错为 null", () => {
  assert.equal(parseDuration("90", 1), 90000);
  assert.equal(parseDuration("250ms", 1), 250);
  assert.equal(parseDuration("2s", 1), 2000);
  assert.equal(parseDuration("1.5m", 1), 90000);
  assert.equal(parseDuration("1h", 1), 3600000);
  assert.equal(parseDuration(undefined, 7), 7);
  assert.equal(parseDuration("3x", 1), null);
  assert.equal(parseDuration("m", 1), null);
});

test("可打的文件：源码且在范围内且在工作树里；测试、声明、node_modules、范围外、已删除都不打", () => {
  const dir = mkdtempSync(join(tmpdir(), "pqw-mut-"));
  try {
    for (const f of ["src/a.ts", "src/a.d.ts", "src/a.test.ts", "tests/b.ts", "node_modules/x/c.ts", "src/d.js", "src/e.md"]) { mkdirSync(join(dir, f, ".."), { recursive: true }); writeFileSync(join(dir, f), "x"); }
    assert.equal(isMutable(dir, "src/a.ts", null), true);
    assert.equal(isMutable(dir, "src/d.js", ["src/"]), true);
    assert.equal(isMutable(dir, "src/a.ts", ["lib/"]), false);
    assert.equal(isMutable(dir, "src/a.d.ts", null), false);
    assert.equal(isMutable(dir, "src/a.test.ts", null), false);
    assert.equal(isMutable(dir, "tests/b.ts", null), false);
    assert.equal(isMutable(dir, "node_modules/x/c.ts", null), false);
    assert.equal(isMutable(dir, "src/e.md", null), false);
    assert.equal(isMutable(dir, "src/gone.ts", null), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("测量有效性：基线不通过、没有位点、全部无覆盖、没有执行任何位点四种无效都让分数为 null；只列时为 null；正常为 true", () => {
  const v = (sites, opts) => { const s = summarize(sites, opts).summary; return [s.valid, s.invalidReason, s.score]; };
  assert.deepEqual(v([site({ verdict: "killed" })], { baselinePassed: false }), [false, "基线不通过", null]);
  assert.deepEqual(v([], {}), [false, "没有位点", null]);
  assert.deepEqual(v([site({ verdict: "uncovered" }), site({ verdict: "uncovered" })], {}), [false, "全部位点无覆盖", null]);
  assert.deepEqual(v([site({ verdict: "uncovered" }), site({ verdict: "notRun", reason: "budget" })], {}), [false, "没有执行任何位点", null]);
  assert.deepEqual(v([site()], { planOnly: true }), [null, null, null]);
  assert.deepEqual(v([site({ verdict: "killed" }), site({ verdict: "uncovered" })], {}), [true, null, 1]);
});

test("汇总：五类计数、超时单列、分数与存活清单的事实", () => {
  const sites = [site({ verdict: "killed" }), site({ verdict: "survived", original: "!", mutant: "" }), site({ verdict: "survived" }), site({ verdict: "uncovered" }), site({ verdict: "notRun" }), site()];
  const { summary, survivors } = summarize(sites);
  assert.deepEqual(summary, { total: 6, killed: 1, survived: 2, uncovered: 1, notRun: 1, planned: 1, timedOut: 0, carried: 0, score: score(sites), valid: true, invalidReason: null });
  assert.equal(summarize([site({ verdict: "killed", reason: "carried" }), site({ verdict: "killed" })]).summary.carried, 1);
  assert.equal(summarize([site({ verdict: "killed", reason: "timeout" }), site({ verdict: "killed" })]).summary.timedOut, 1);
  assert.equal(survivors[0].suggestion, "删去 ! 后测试仍过", "只陈述事实");
  assert.equal(survivors[1].suggestion, "&& 换成 || 后测试仍过");
  assert.equal(survivors.length, 2);
  assert.match(survivors[0].suggestion, /^删去 ! 后测试仍过/);
  assert.match(survivors[1].suggestion, /^&& 换成 \|\| 后测试仍过/);
  assert.deepEqual(summarize([]).summary.total, 0);
});

test("表格：只列时不报计数；基线不过时贴尾巴；裁定带原因；没有位点时写一行说明；存活清单在末尾", () => {
  const base = "0123456789abcdef";
  const sites = [site({ verdict: "killed", reason: "carried" }), site({ verdict: "survived", line: 2, original: "!", mutant: "", category: "negation" })];
  const { summary, survivors } = summarize(sites);
  const ran = formatMutation({ base, planOnly: false, baseline: { passed: true, tail: "" }, sites, summary, survivors, recheck: { total: 2, killed: 1, survived: 1, timedOut: 0, notRun: 0 } });
  assert.match(ran, /^差分变异：基线 0123456789ab 到工作树；位点 2：杀死 1、存活 1、无覆盖 0、未跑 0；分数 50%；沿用 1；复核 2（超时转杀死 1、存活 1、仍超时 0）\n/);
  assert.match(ran, /\| a\.ts \| f \| 1 \| `&&` \| `\|\|` \| logical \| 杀死（carried） \|/);
  assert.match(ran, /\| a\.ts \| f \| 2 \| `!` \| `（删去）` \| negation \| 存活 \|/);
  assert.match(ran, /\n\n存活的位点：\n- a\.ts:2 f：删去 ! 后测试仍过/);
  const planned = formatMutation({ base, planOnly: true, baseline: { passed: null }, sites: [site()], summary: summarize([site()]).summary, survivors: [] });
  assert.match(planned, /位点 1（只列）\n\| 文件/);
  assert.match(planned, /\| 待跑 \|/);
  const failed = formatMutation({ base, planOnly: false, baseline: { passed: false, tail: "boom" }, sites: [], summary: summarize([], { baselinePassed: false }).summary, survivors: [] });
  assert.match(failed, /位点 0：测量无效（基线不通过）\n基线不通过：\nboom\n\| 文件/, "第五程 C4 起无效时不出计数与分数，原断言是「分数 无」");
  assert.match(failed, /\| \| 没有位点 \|/);
  const segs = formatMutation({ base, planOnly: false, baseline: { passed: true, tail: "" }, sites, summary, survivors, unmutated: [{ file: "a.ts", unit: null, lines: [1, 2], reason: "改动行不在任何有名单元里" }, { file: "a.ts", unit: "g", lines: [5, 7], reason: "单元里没有可替换的位点" }] });
  assert.match(segs, /\n\n没有位点的改动段（不进分数）：\n- a\.ts:1-2：改动行不在任何有名单元里\n- a\.ts:5-7 g：单元里没有可替换的位点/);
  const timed = [site({ verdict: "killed", reason: "timeout" }), site({ verdict: "killed" })];
  const hit = formatMutation({ base, planOnly: false, baseline: { passed: true, tail: "" }, sites: timed, ...summarize(timed), recheck: { total: 1, killed: 0, survived: 0, timedOut: 1, notRun: 0 } });
  assert.match(hit, /^差分变异：基线 0123456789ab 到工作树；位点 2：杀死 2（其中超时 1）、存活 0、无覆盖 0、未跑 0；分数 100%；复核 1（超时转杀死 0、存活 0、仍超时 1）\n\| 文件/);
  const partial = formatMutation({ base, planOnly: false, baseline: { passed: true, tail: "" }, sites: timed, ...summarize(timed), recheck: { total: 3, killed: 1, survived: 0, timedOut: 1, notRun: 1 } });
  assert.match(partial, /复核 3（超时转杀死 1、存活 0、仍超时 1、未复核 1）\n/);
  assert.match(formatMutation({ base, planOnly: false, baseline: { passed: true, tail: "" }, sites: timed, ...summarize(timed), recheck: null }), /^差分变异：基线 0123456789ab 到工作树；位点 2：杀死 2（其中超时 1）、存活 0、无覆盖 0、未跑 0；分数 100%\n\| 文件/, "没有复核时计数后直接换行");
});
