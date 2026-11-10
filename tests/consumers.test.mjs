// consumers：按 spec 写出的旧字面全仓搜消费者，标出不在责任分级里的。
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { makeRepo, writeFiles, dispose, git } from "./fixture.mjs";

const SCRIPT = new URL("../skills/spec-and-plan/scripts/consumers.mjs", import.meta.url).pathname;

const SPEC = (...paths) => `# 示例 实施规格（revision 1）

## 不变式对照

- 旧字面：\`model-refused\` \`capacity-gone\`

## 责任分级

| 级别 | 成员与路径（反引号括起，可多个） | 本程对它做什么 |
| --- | --- | --- |
| 重点 | ${paths.map((p) => `\`${p}\``).join(" ")} | 改承诺 |
| 次要 | 无 | 无 |
| 连带 | 无 | 无 |
`;

const run = (dir, ...args) => spawnSync("node", [SCRIPT, "--repo", dir, ...args], { encoding: "utf8" });

const repo = () => makeRepo({
  ".gitignore": "tmp/\n",
  "src/a.ts": "export const reason = 'model-refused';\n",
  "apps/x/flow.spec.ts": "expect(r).toBe('model-refused');\nexpect(r).not.toBe('model-refused');\n",
  "docs/n.md": "无关\n",
});

test("按 spec 的旧字面搜：范围外的命中列为「范围外」并退出 1；没有命中的字面写「无命中」", () => {
  const dir = repo();
  try {
    writeFiles(dir, { "tmp/run/spec.md": SPEC("src/") });
    const r = run(dir, "--spec", join(dir, "tmp/run/spec.md"));
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /^## `model-refused`$/m);
    assert.match(r.stdout, /^\| `apps\/x\/flow\.spec\.ts` \| 2 \| 范围外 \|$/m);
    assert.match(r.stdout, /^\| `src\/a\.ts` \| 1 \| 范围内 \|$/m);
    assert.match(r.stdout, /^## `capacity-gone`\n\n无命中$/m);
    assert.match(r.stdout, /^范围外命中 1 个文件：补进责任分级（本程改动带出的消费者），或确认它不受这次改动影响$/m);
    writeFiles(dir, { "tmp/run/spec.md": SPEC("src/", "apps/x") });
    assert.equal(run(dir, "--spec", join(dir, "tmp/run/spec.md")).status, 0, "补进责任分级后退出 0");
  } finally { dispose(dir); }
});

test("--literal 直接给字面，不给 spec 就不判范围；都没给退出 2；spec 里没有旧字面行退出 2", () => {
  const dir = repo();
  try {
    const r = run(dir, "--literal", "model-refused");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^\| `apps\/x\/flow\.spec\.ts` \| 2 \| 未判 \|$/m);
    assert.equal(run(dir).status, 2);
    writeFiles(dir, { "tmp/run/spec.md": SPEC("src/").replace(/^- 旧字面：.*\n/m, "") });
    const none = run(dir, "--spec", join(dir, "tmp/run/spec.md"));
    assert.equal(none.status, 2);
    assert.match(none.stderr, /spec 里没有「- 旧字面：」行/);
  } finally { dispose(dir); }
});

test("只搜 Git 跟踪的文件，spec 自己与忽略的目录不算；--format json 结构稳定", () => {
  const dir = repo();
  try {
    writeFiles(dir, { "tmp/run/spec.md": SPEC("src/", "apps/"), "tmp/other.md": "model-refused\n" });
    git(dir, "add -f tmp/run/spec.md");
    git(dir, 'commit -q -m "跟踪 spec"');
    const r = run(dir, "--spec", join(dir, "tmp/run/spec.md"), "--format", "json");
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.literals.map((l) => [l.literal, l.hits.map((h) => [h.file, h.count, h.scope])]), [
      ["model-refused", [["apps/x/flow.spec.ts", 2, "范围内"], ["src/a.ts", 1, "范围内"]]],
      ["capacity-gone", []],
    ]);
    assert.equal(out.outside, 0);
  } finally { dispose(dir); }
});
