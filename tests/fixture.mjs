// 测试夹具：在系统临时目录建一个小 Git 仓库，提交一版基线，再改工作树。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

export const git = (cwd, cmd) => execSync(`git ${cmd}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();

export function makeRepo(baseFiles) {
  const dir = mkdtempSync(join(tmpdir(), "pqw-fixture-"));
  git(dir, "init -q -b main");
  writeFiles(dir, baseFiles);
  git(dir, "add -A");
  git(dir, 'commit -q -m base');
  return dir;
}

export function writeFiles(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
}

export const dispose = (dir) => rmSync(dir, { recursive: true, force: true });

/** 仓库根：本文件在 tests/ 下。 */
export const REPO_ROOT = new URL("../", import.meta.url).pathname;

/** typescript 模块路径：PQW_TS 环境变量，否则从仓库根的 node_modules 解析；都没有返回 null。 */
export function tsPath() {
  if (process.env.PQW_TS && existsSync(process.env.PQW_TS)) return process.env.PQW_TS;
  try { return dirname(createRequire(REPO_ROOT).resolve("typescript/package.json")); } catch { return null; }
}

/** Stryker 模块目录：PQW_STRYKER_MODULES 环境变量，否则仓库根的 node_modules；都没有返回 null。 */
export function strykerModules() {
  const candidates = [process.env.PQW_STRYKER_MODULES, join(REPO_ROOT, "node_modules")].filter(Boolean);
  return candidates.find((d) => existsSync(join(d, "@stryker-mutator/core"))) ?? null;
}

export const VITEST_SRC = `export function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

export function isPos(n: number): boolean {
  return n > 0;
}

export function unused(a: number, b: number): number {
  return a + b;
}
`;
const VITEST_TEST = `import { test, expect } from "vitest";
import { clamp, isPos } from "../src/calc";

test("clamp keeps inside", () => {
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(-1, 0, 10)).toBe(0);
  expect(clamp(11, 0, 10)).toBe(10);
});

test("isPos", () => {
  expect(isPos(1)).toBe(true);
  expect(isPos(-1)).toBe(false);
});
`;

/** 一个用 vitest 的小项目：有配置、package.json、源码与用例，.stryker-tmp 已忽略；modulesDir 给了就把 node_modules 软链过去。 */
export function makeVitestRepo(modulesDir = null) {
  const dir = makeRepo({
    "package.json": JSON.stringify({ name: "fixture", private: true, type: "module", devDependencies: { vitest: "4.1.11" } }) + "\n",
    "vitest.config.ts": 'import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { include: ["test/**/*.test.ts"] } });\n',
    ".gitignore": "node_modules\n.stryker-tmp\n",
    "src/calc.ts": VITEST_SRC,
    "test/calc.test.ts": VITEST_TEST,
  });
  if (modulesDir) symlinkSync(modulesDir, join(dir, "node_modules"), "dir");
  return dir;
}

/** 一个成员的文件：package.json、vitest 配置、源码与用例，路径前面带成员目录。 */
const memberFiles = (member) => ({
  [`${member}/package.json`]: JSON.stringify({ name: member.split("/").pop(), private: true, type: "module", devDependencies: { vitest: "4.1.11" } }) + "\n",
  [`${member}/vitest.config.ts`]: 'import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { include: ["test/**/*.test.ts"] } });\n',
  [`${member}/src/calc.ts`]: VITEST_SRC,
  [`${member}/test/calc.test.ts`]: VITEST_TEST,
});

/** 多包仓库：Git 根没有 vitest 配置，members 里每个成员各有一份；modulesDir 给了就把每个成员的 node_modules 软链过去。 */
export function makeMonorepo(modulesDir = null, members = ["packages/a", "packages/b"]) {
  const dir = makeRepo({
    "package.json": JSON.stringify({ name: "mono", private: true, type: "module" }) + "\n",
    ".gitignore": "node_modules\n.stryker-tmp*\n",
    ...Object.assign({}, ...members.map(memberFiles)),
  });
  if (modulesDir) for (const m of members) symlinkSync(modulesDir, join(dir, m, "node_modules"), "dir");
  return dir;
}
