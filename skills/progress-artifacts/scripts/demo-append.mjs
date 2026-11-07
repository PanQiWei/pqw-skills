#!/usr/bin/env node
// demo 追加：向单文件 HTML demo 追加一个切片的段落；同一切片号再追加时替换原段。文件不存在时从骨架创建。
// 用法：demo-append.mjs --demo <html> --slice <号> --title <标题> (--file <HTML 片段文件> | --text <一段文字>) [--page-title <页标题>]
// 退出 0 正常；1 读不到片段；2 用法错误。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "用法：demo-append.mjs --demo <html> --slice <号> --title <标题> (--file <HTML 片段文件> | --text <一段文字>) [--page-title <页标题>]";
const opts = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0); }
  if (!a.startsWith("--") || i + 1 >= argv.length) { console.error(`参数错误 ${a}`); console.error(USAGE); process.exit(2); }
  opts[a.slice(2)] = argv[++i];
}
if (!opts.demo || !opts.slice || !opts.title || (!opts.file && !opts.text)) { console.error(USAGE); process.exit(2); }

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const demoPath = resolve(opts.demo);
let html;
if (existsSync(demoPath)) html = readFileSync(demoPath, "utf8");
else html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "demo-skeleton.html"), "utf8").replace(/\{\{title\}\}/g, esc(opts["page-title"] ?? "demo"));

let body;
if (opts.file) { try { body = readFileSync(resolve(opts.file), "utf8"); } catch { console.error(`读不到片段：${opts.file}`); process.exit(1); } }
else body = `<p>${esc(opts.text)}</p>`;

const id = String(opts.slice).padStart(2, "0");
const when = new Date().toISOString().slice(0, 16).replace("T", " ") + "Z";
const section = `<!-- pqw:slice ${id} -->\n<section class="slice" id="slice-${id}">\n<h2>切片 ${id}：${esc(opts.title)}</h2>\n<div class="when">${when}</div>\n${body.trim()}\n</section>\n<!-- /pqw:slice ${id} -->`;
const existing = new RegExp(`<!-- pqw:slice ${id} -->[\\s\\S]*?<!-- /pqw:slice ${id} -->`);
if (existing.test(html)) html = html.replace(existing, section);
else if (html.includes("<!-- /pqw:sections -->")) html = html.replace("<!-- /pqw:sections -->", `${section}\n<!-- /pqw:sections -->`);
else { console.error("demo 文件没有 <!-- /pqw:sections --> 标记，不是本骨架生成的"); process.exit(1); }
writeFileSync(demoPath, html);
console.log(demoPath);
