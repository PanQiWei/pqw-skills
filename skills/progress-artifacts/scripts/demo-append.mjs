#!/usr/bin/env node
// demo 追加：向单文件 HTML demo 追加一个切片的段落；同一切片号再追加时替换原段。文件不存在时从骨架创建。逻辑在 lib/demo.mjs，本文件只是命令面。
// 用法：demo-append.mjs --demo <html> --slice <号> --title <标题> (--file <HTML 片段文件> | --text <一段文字>) [--page-title <页标题>]
// 退出 0 正常；1 读不到片段或文件不是本骨架生成的；2 用法错误。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOptions } from "./lib/args.mjs";
import { esc, requiredGiven, fromSkeleton, sliceId, sliceSection, appendSection, SECTIONS_END } from "./lib/demo.mjs";

const USAGE = "用法：demo-append.mjs --demo <html> --slice <号> --title <标题> (--file <HTML 片段文件> | --text <一段文字>) [--page-title <页标题>]";
const { opts, help, error } = parseOptions(process.argv.slice(2));
if (help) { console.log(USAGE); process.exit(0); }
if (error) { console.error(error); console.error(USAGE); process.exit(2); }
if (!requiredGiven(opts)) { console.error(USAGE); process.exit(2); }

/** 读片段文件，读不到退出 1。 */
const readFragment = (p) => { try { return readFileSync(resolve(p), "utf8"); } catch { console.error(`读不到片段：${p}`); process.exit(1); } };

const demoPath = resolve(opts.demo);
const html = existsSync(demoPath) ? readFileSync(demoPath, "utf8") : fromSkeleton(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "demo-skeleton.html"), "utf8"), opts["page-title"]);
const body = opts.file ? readFragment(opts.file) : `<p>${esc(opts.text)}</p>`;
const id = sliceId(opts.slice);
const when = new Date().toISOString().slice(0, 16).replace("T", " ") + "Z";
const next = appendSection(html, sliceSection({ id, title: opts.title, body, when }), id);
if (next === null) { console.error(`demo 文件没有 ${SECTIONS_END} 标记，不是本骨架生成的`); process.exit(1); }
writeFileSync(demoPath, next);
console.log(demoPath);
