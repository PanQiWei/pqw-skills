#!/usr/bin/env node
// 解析并创建汇报件目录，打印绝对路径。各操作系统一致，借用系统临时目录的定期清理。
// 退出 0 正常；1 创建失败；2 用法错误。
//
// 用法：artifacts-dir.mjs [--session <id>] [--run <id>] [--sub <子目录>] [--no-create]
//   --session  会话标识，默认取 CLAUDE_CODE_SESSION_ID、CODEX_COMPANION_SESSION_ID、PQW_SESSION，再不然 unknown
//   --run      一程标识，默认 run
//   --sub      子目录名，默认 artifacts；哨兵用 sentinel
//   --no-create 只打印不创建

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const USAGE = "用法：artifacts-dir.mjs [--session <id>] [--run <id>] [--sub <子目录>] [--no-create]";
const opts = { sub: "artifacts", create: true, run: "run" };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
      console.error(`${a} 缺少值`);
      console.error(USAGE);
      process.exit(2);
    }
    return argv[++i];
  };
  if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0); }
  else if (a === "--session") opts.session = next();
  else if (a === "--run") opts.run = next();
  else if (a === "--sub") opts.sub = next();
  else if (a === "--no-create") opts.create = false;
  else { console.error(`未知参数 ${a}`); console.error(USAGE); process.exit(2); }
}

const session = opts.session ?? process.env.CLAUDE_CODE_SESSION_ID ?? process.env.CODEX_COMPANION_SESSION_ID ?? process.env.PQW_SESSION ?? "unknown";
const dir = join(tmpdir(), "pqw-skills", session, opts.run, opts.sub);
if (opts.create) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.error(`创建失败：${dir}：${e.message}`);
    process.exit(1);
  }
}
console.log(dir);
