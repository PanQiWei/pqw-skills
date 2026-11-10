#!/usr/bin/env node
// 按被改承诺的旧字面全仓搜消费者。逻辑在 lib/consumers.mjs，本文件只是命令面。
// 退出 0 没有范围外的命中（或没给 spec、不判范围）；1 有范围外的命中；2 用法错误或读不到文件。
import { readFileSync, realpathSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { literalsOf, scopeOfSpec, findConsumers, formatConsumers } from "./lib/consumers.mjs";

const USAGE = `用法：consumers.mjs [--spec <spec.md>] [--literal <文本>]... [--repo <目录>] [--format json]
改一条承诺时，断言旧承诺的测试与文档也是它的消费者。按旧字面（原因码、状态名、文本）在 Git 跟踪的文件里搜，列出每个字面命中哪些文件、各几处，给了 spec 就按它的「责任分级」标范围内或范围外。

  --spec <路径>       读 spec 里「- 旧字面：\`a\` \`b\`」各行与「责任分级」；spec 自己不算命中
  --literal <文本>    直接给一个字面，可给多次；与 --spec 同给时合并
  --repo <目录>       仓库里任一目录，缺省当前目录
  --format json       打印 { literals: [{ literal, hits: [{ file, count, scope }] }], outside }

退出 0 没有范围外的命中；1 有；2 用法错误或读不到文件。`;

const usageError = (message) => { console.error(message); console.error(USAGE); process.exit(2); };
const opts = { literal: [] };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0); }
  if (!["--spec", "--literal", "--repo", "--format"].includes(a)) usageError(`未知参数 ${a}`);
  if (i + 1 >= argv.length) usageError(`${a} 缺少值`);
  if (a === "--literal") opts.literal.push(argv[++i]);
  else opts[a.slice(2)] = argv[++i];
}

const repo = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: resolve(opts.repo ?? "."), encoding: "utf8" }).stdout.trim();
if (!repo) usageError(`不在 Git 仓库里：${opts.repo ?? "."}`);
let specText = null;
if (opts.spec) { try { specText = readFileSync(resolve(opts.spec), "utf8"); } catch { usageError(`读不到：${opts.spec}`); } }
const fromSpec = specText === null ? [] : literalsOf(specText);
if (specText !== null && fromSpec.length === 0 && opts.literal.length === 0) usageError("spec 里没有「- 旧字面：」行：在不变式对照或失败语义里写「- 旧字面：`<旧原因码>` `<旧状态名>`」，或用 --literal 直接给");
const literals = [...new Set([...fromSpec, ...opts.literal])];
if (literals.length === 0) usageError("未提供：--spec 或 --literal");

const specRel = opts.spec ? relative(realpathSync(repo), realpathSync(resolve(opts.spec))) : null;
const result = findConsumers({ repo, literals, scope: specText === null ? null : scopeOfSpec(specText), exclude: specRel ? [specRel] : [] });
console.log(opts.format === "json" ? JSON.stringify(result, null, 2) : formatConsumers(result));
process.exit(result.outside === 0 ? 0 : 1);
