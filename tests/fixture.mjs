// 测试夹具：在系统临时目录建一个小 Git 仓库，提交一版基线，再改工作树。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
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

/** typescript 模块路径：PQW_TS 环境变量，或从当前目录解析；都没有返回 null。 */
export function tsPath() {
  if (process.env.PQW_TS && existsSync(process.env.PQW_TS)) return process.env.PQW_TS;
  try { return dirname(createRequire(process.cwd() + "/").resolve("typescript/package.json")); } catch { return null; }
}
