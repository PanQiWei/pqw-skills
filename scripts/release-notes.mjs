#!/usr/bin/env node
// 从 CHANGELOG.md 取某一版的 GitHub Release 标题与正文。只读，纯 Node，无依赖。
// 正文是这一节里「### 细节」之前的部分，末尾加一行指向完整记录的链接。退出 0 成功，1 没有这一节，2 用法错误。
//   node scripts/release-notes.mjs 0.24.1 --title   打印标题
//   node scripts/release-notes.mjs 0.24.1           打印正文
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DETAIL = "### 细节";

/** CHANGELOG 里按出现顺序的各版：标题行写成「## <版本> · <标题>」的才算带标题。 */
export function sections(text) {
  const lines = text.split("\n");
  const heads = lines.flatMap((line, i) => {
    const m = /^## (\d+\.\d+\.\d+)(?: · (.+))?$/.exec(line);
    return m ? [{ version: m[1], title: m[2] ?? null, at: i }] : [];
  });
  const nextSection = (from) => {
    const at = lines.findIndex((l, i) => i > from && l.startsWith("## "));
    return at < 0 ? lines.length : at;
  };
  return heads.map((h) => ({ version: h.version, title: h.title, lines: lines.slice(h.at + 1, nextSection(h.at)) }));
}

/** 一节里给 Release 用的部分：「细节」之前，首尾空行去掉。 */
export function summary(section) {
  const cut = section.lines.indexOf(DETAIL);
  return (cut < 0 ? section.lines : section.lines.slice(0, cut)).join("\n").trim();
}

function main() {
  const args = process.argv.slice(2);
  const wantTitle = args.includes("--title");
  const rest = args.filter((a) => a !== "--title");
  if (rest.length !== 1 || rest[0].startsWith("-")) {
    console.error("用法：node scripts/release-notes.mjs <版本> [--title]");
    process.exit(2);
  }
  const version = rest[0].replace(/^v/, "");
  const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
  const section = sections(readFileSync(join(repo, "CHANGELOG.md"), "utf8")).find((s) => s.version === version);
  if (!section) {
    console.error(`CHANGELOG.md 里没有 ${version} 这一节`);
    process.exit(1);
  }
  if (wantTitle) {
    console.log(section.title ? `v${version} · ${section.title}` : `v${version}`);
    return;
  }
  const home = JSON.parse(readFileSync(join(repo, ".claude-plugin/plugin.json"), "utf8")).repository;
  console.log(`${summary(section)}\n\n完整记录见 [CHANGELOG](${home}/blob/v${version}/CHANGELOG.md)。`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
