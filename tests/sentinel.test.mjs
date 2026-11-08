// 哨兵脚本：唤醒一次写汇报；增量摘要列提交、改动统计与新交回件；信号：停滞、可能兜圈、主代理连续两轮无处置。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, writeFiles, dispose, git } from "./fixture.mjs";

const SCRIPT = new URL("../skills/one-lesson-rule/scripts/sentinel.mjs", import.meta.url).pathname;

const PLAN = `# 计划

## 进度总览

进度：[■□□□] 1/4 切片已完成 · 更新 T · head abc
当前：切片 02 实施

| 切片 | 交付的行为 | 对应验收 | 状态 |
| --- | --- | --- | --- |
| 01 | a | C1 | 已完成 abc |
| 02 | b | C2 | 进行中（x） |

| 子代理 | 用途 | 派发理由（派发门三条之一） | 模型与档位 | 开始 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 哨兵 | 哨兵，45 分钟，4 轮 | 理由二 | 便宜档 | ${new Date().toISOString()} | 第 1/4 轮 |

- [x] 里程碑一：做完
- [ ] 里程碑二：没做
`;

const wake = (dir, out) => {
  const r = spawnSync("node", [SCRIPT, "--plan", join(dir, "tmp/run-x/plan.md"), "--out", out, "--once"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return readFileSync(join(out, "latest.md"), "utf8");
};

test("--help 退出 0；缺 --plan 退出 2；读不到 plan 退出 1", () => {
  assert.equal(spawnSync("node", [SCRIPT, "--help"], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync("node", [SCRIPT, "--once"], { encoding: "utf8" }).status, 2);
  assert.equal(spawnSync("node", [SCRIPT, "--plan", "/nonexistent/plan.md", "--once", "--out", "/tmp/pqw-sentinel-none"], { encoding: "utf8" }).status, 1);
});

test("唤醒一次：进度、切片表、里程碑计数、在跑的子代理、增量摘要；第二次列出新提交与新交回件；第三次停滞与两轮无处置", () => {
  const dir = makeRepo({ "README.md": "x\n" });
  const out = join(dir, "tmp/run-x/sentinel");
  try {
    writeFiles(dir, { "tmp/run-x/plan.md": PLAN });
    const first = wake(dir, out);
    assert.match(first, /第 1 次唤醒；上次 无/);
    assert.match(first, /进度：\[■□□□\] 1\/4 切片已完成/);
    assert.match(first, /\| 02 \| 进行中（x） \|/);
    assert.match(first, /里程碑：1\/2 已勾/);
    assert.match(first, /- 哨兵：哨兵，45 分钟，4 轮，开始 20\d\d-/);
    assert.match(first, /## 增量摘要\n\n- 上次唤醒以来提交 1 条/);
    assert.match(first, /- 处置记录：0 条\n/);
    assert.match(first, /- 无异常信号/);

    writeFiles(dir, { "src/a.ts": "export const a = 1;\n" });
    git(dir, "add src");
    git(dir, 'commit -q -m "feat: 加 a"');
    mkdirSync(join(dir, "tmp/run-x/artifacts"), { recursive: true });
    writeFileSync(join(dir, "tmp/run-x/artifacts/metrics-s02.json"), "{}\n");
    const second = wake(dir, out);
    assert.match(second, /第 2 次唤醒；上次 20/);
    assert.match(second, /- 上次唤醒以来提交 1 条\n```\n[0-9a-f]+ feat: 加 a\n```/);
    assert.match(second, /- 新出现的交回件：\n  - artifacts\/metrics-s02\.json\n/);
    assert.match(second, /- 可能兜圈：有提交但「当前」行没变/);
    assert.doesNotMatch(second, /停滞/);
    assert.doesNotMatch(second, /连续 \d+ 轮没有写处置/);
    assert.match(second, /- 未提交改动：无\n/);

    const third = wake(dir, out);
    assert.match(third, /- 停滞：上次唤醒以来没有新提交，工作树也没变/);
    assert.match(third, /- 主代理连续 2 轮没有写处置：plan 里仍是 0 条/);
    assert.match(third, /- 处置记录：0 条；连续 2 轮没有新增/);

    writeFiles(dir, { "tmp/run-x/plan.md": PLAN + "\n处置 1（2026-11-08T04:00Z）：继续；无信号\n" });
    const fourth = wake(dir, out);
    assert.match(fourth, /- 处置记录：1 条\n/);
    assert.doesNotMatch(fourth, /没有写处置/);
    assert.ok(existsSync(join(out, "state.json")));
    assert.equal(JSON.parse(readFileSync(join(out, "state.json"), "utf8")).n, 4);
  } finally { dispose(dir); }
});
