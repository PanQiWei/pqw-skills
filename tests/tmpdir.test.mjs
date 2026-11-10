// 测试的临时目录都在本轮的临时根下，跑完由 global-setup 一并删掉。
import { test } from "vitest";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

test("用例与子进程的临时目录都在本轮的临时根下", () => {
  const root = process.env.PQW_TEST_TMP_ROOT;
  assert.ok(root, "global-setup 设了临时根");
  assert.equal(tmpdir(), root);
  const child = spawnSync(process.execPath, ["-e", "console.log(require('node:os').tmpdir())"], { encoding: "utf8" });
  assert.equal(child.stdout.trim(), root, "子进程继承同一个临时根");
});
