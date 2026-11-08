import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = new URL("../skills/progress-artifacts/scripts/demo-append.mjs", import.meta.url).pathname;

test("--help 退出 0；缺参数退出 2", () => {
  assert.equal(spawnSync("node", [SCRIPT, "--help"], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync("node", [SCRIPT, "--demo", "x.html"], { encoding: "utf8" }).status, 2);
});

test("首次从骨架创建并追加；再追加不同切片在后面；同一切片号替换不重复", () => {
  const d = mkdtempSync(join(tmpdir(), "pqw-demo-"));
  try {
    const demo = join(d, "demo.html");
    let r = spawnSync("node", [SCRIPT, "--demo", demo, "--slice", "1", "--title", "登录", "--text", "能登录了", "--page-title", "示例 demo"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    let html = readFileSync(demo, "utf8");
    assert.match(html, /<title>示例 demo<\/title>/);
    assert.match(html, /切片 01：登录/);
    writeFileSync(join(d, "frag.html"), "<pre>curl /health</pre>");
    r = spawnSync("node", [SCRIPT, "--demo", demo, "--slice", "2", "--title", "健康检查", "--file", join(d, "frag.html")], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    html = readFileSync(demo, "utf8");
    assert.ok(html.indexOf("切片 01：登录") < html.indexOf("切片 02：健康检查"));
    assert.match(html, /<pre>curl \/health<\/pre>/);
    r = spawnSync("node", [SCRIPT, "--demo", demo, "--slice", "01", "--title", "登录（改）", "--text", "改成手机号登录"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    html = readFileSync(demo, "utf8");
    assert.equal((html.match(/<!-- pqw:slice 01 -->/g) ?? []).length, 1);
    assert.match(html, /登录（改）/);
    assert.doesNotMatch(html, /能登录了/);
    assert.ok(html.indexOf("切片 01：登录（改）") < html.indexOf("切片 02：健康检查"), "替换保持原位置");
    assert.equal((html.match(/<section class="slice"/g) ?? []).length, 2);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
