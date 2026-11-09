// 没给 --ts 时找 typescript：Git 根、成员目录、pnpm 存储依次找，只收有 JS 接口的；都没有时退出 2 并写出找到了什么。
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, symlinkSync, realpathSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { makeRepo, writeFiles, dispose, tsPath } from "./fixture.mjs";
import { loadTypescript } from "../skills/slice-closeout/scripts/lib/adapter-typescript.mjs";

const TS = tsPath();
const BASE = "export function f(a: number) {\n  if (a > 0) return 1;\n  return 0;\n}\n";
const METRICS = new URL("../skills/slice-closeout/scripts/metrics.mjs", import.meta.url).pathname;
const tmp = () => mkdtempSync(join(tmpdir(), "pqw-tslookup-"));

/** 假的 typescript 包：有 JS 接口的 main 导出 createSourceFile 与版本标记；没有的只有 package.json（7.x 的样子）。 */
function fakeTs(dir, version, { api = true } = {}) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "typescript", version, ...(api ? { main: "index.js" } : {}) }));
  if (api) writeFileSync(join(dir, "index.js"), `module.exports = { createSourceFile() {}, tag: ${JSON.stringify(version)} };\n`);
  return dir;
}
/** pnpm 存储里的一份：node_modules/.pnpm/typescript@<版本>/node_modules/typescript。 */
const storeDir = (root, version, suffix = "") => join(root, "node_modules", ".pnpm", `typescript@${version}${suffix}`, "node_modules", "typescript");

test("只有 pnpm 存储里有 6.x：没给 --ts 也找得到，是真能解析源码的 typescript", { skip: TS ? false : "没有 typescript" }, () => {
  const root = tmp();
  try {
    mkdirSync(dirname(storeDir(root, "6.0.3")), { recursive: true });
    symlinkSync(realpathSync(TS), storeDir(root, "6.0.3"), "dir");
    const ts = loadTypescript(undefined, root);
    assert.equal(typeof ts.createSourceFile, "function");
    assert.ok(ts.createSourceFile("a.ts", "let x = 1;", ts.ScriptTarget.Latest, true).statements.length === 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("存储里有几份：取有 JS 接口的最高版本，按数字分量比（6.0.10 高于 6.0.9，不按字典序），没有接口的高版本跳过，带 peer 后缀的目录名也认", () => {
  const root = tmp();
  try {
    for (const v of ["5.9.2", "6.0.9", "6.0.10"]) fakeTs(storeDir(root, v), v);
    fakeTs(storeDir(root, "7.0.2"), "7.0.2", { api: false });
    assert.equal(loadTypescript(undefined, root).tag, "6.0.10");
    fakeTs(storeDir(root, "6.1.0", "_peer@1"), "6.1.0");
    assert.equal(loadTypescript(undefined, root).tag, "6.1.0");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("先 Git 根，再成员目录，最后存储：前面有 JS 接口就用前面的；成员里是 7.x 没有接口时继续往后找，落到存储里的 6.x", () => {
  // 每种情形各用一个新目录：Node 的 require 按路径缓存解析结果，同一路径改了内容读不到。
  const scene = (layout) => {
    const root = tmp();
    try {
      for (const [where, version, api] of layout) fakeTs(where === "store" ? storeDir(root, version) : join(root, where, "node_modules/typescript"), version, { api });
      return loadTypescript(undefined, root, join(root, "packages/a"));
    } finally { rmSync(root, { recursive: true, force: true }); }
  };
  const member = "packages/a";
  assert.equal(scene([[".", "5.5.0", true], [member, "5.6.0", true], ["store", "6.0.3", true]]).tag, "5.5.0", "Git 根先于成员目录");
  assert.equal(scene([[member, "5.6.0", true], ["store", "6.0.3", true]]).tag, "5.6.0", "成员目录先于存储");
  assert.equal(scene([[member, "7.0.2", false], ["store", "6.0.3", true]]).tag, "6.0.3", "成员里的 7.x 没有 JS 接口，不拦住后面的 6.x");
  const root = tmp();
  try {
    fakeTs(join(root, "packages/a/node_modules/typescript"), "5.6.0");
    assert.throws(() => loadTypescript(undefined, root), /找不到 typescript/, "不给成员目录时不找成员");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("只有 7.x（没有 JS 接口）：抛「未提供」，消息写出找到的路径与版本，并说明用 --ts 指到一个 6.x", () => {
  const root = tmp();
  try {
    const seven = fakeTs(join(root, "node_modules/typescript"), "7.0.2", { api: false });
    assert.throws(() => loadTypescript(undefined, root), (e) => {
      assert.match(e.message, /^未提供：/);
      assert.ok(e.message.includes(`${seven}（7.0.2）`), e.message);
      assert.match(e.message, /没有 JS 接口/);
      assert.match(e.message, /--ts[^\n]*6\.x/);
      return true;
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("哪里都没有 typescript：抛「未提供」，列出找过的位置并提示 --ts；显式 --ts 不可用时保持原来的消息", () => {
  const root = tmp();
  try {
    assert.throws(() => loadTypescript(undefined, root), (e) => /^未提供：找不到 typescript/.test(e.message) && e.message.includes(join(root, "node_modules")) && /--ts/.test(e.message));
    assert.throws(() => loadTypescript(join(root, "nope"), root), /未提供：找不到可用的 typescript（.*nope）。用 --ts 指定 typescript 包目录。$/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("命令面 metrics：不给 --ts，只有存储里的 6.x 时能跑；只有 7.x 时退出 2，消息含版本与路径", { skip: TS ? false : "没有 typescript" }, () => {
  const dir = makeRepo({ "src/a.ts": BASE, ".gitignore": "node_modules\n" });
  try {
    writeFiles(dir, { "src/a.ts": BASE.replace("return 1", "return 2") });
    const seven = fakeTs(join(dir, "node_modules/typescript"), "7.0.2", { api: false });
    const bad = spawnSync("node", [METRICS, "--repo", dir, "--base", "HEAD"], { encoding: "utf8" });
    assert.equal(bad.status, 2, bad.stdout);
    assert.ok(bad.stderr.includes(`${seven}（7.0.2）`), bad.stderr);
    mkdirSync(dirname(storeDir(dir, "6.0.3")), { recursive: true });
    symlinkSync(realpathSync(TS), storeDir(dir, "6.0.3"), "dir");
    const ok = spawnSync("node", [METRICS, "--repo", dir, "--base", "HEAD", "--format", "json"], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.deepEqual(JSON.parse(ok.stdout).functions.map((f) => f.name), ["f"]);
  } finally { dispose(dir); }
});
