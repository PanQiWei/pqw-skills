// 按被改承诺的旧字面（原因码、状态名、文本）全仓搜消费者：断言旧承诺的测试与文档也是消费者，源码的调用方能按引用找，它们只能按字面找。
// 只报事实：每个字面命中哪些文件、各几处、在不在 spec 的责任分级里。哪个要改归人与设计段判。
import { spawnSync } from "node:child_process";
import { sections, scopePaths, covered, normalizePath } from "./check-plan.mjs";

/** spec 里「- 旧字面：`a` `b`」各行的反引号内容，按出现顺序去重。 */
export function literalsOf(specText) {
  const out = [];
  for (const m of specText.matchAll(/^- 旧字面：(.*)$/gm)) for (const l of m[1].matchAll(/`([^`]+)`/g)) if (!out.includes(l[1])) out.push(l[1]);
  return out;
}

/** spec 责任分级三级的路径；没有这一节返回 null（不判范围）。 */
export function scopeOfSpec(specText) {
  const sec = sections(specText).find((s) => s.title === "责任分级" || s.title?.startsWith("责任分级（"));
  return sec ? scopePaths(sec) : null;
}

/** 一个字面在 Git 跟踪的文本文件里的命中：[{ file, count }]，按文件名排序；exclude 里的仓库相对路径不算。 */
export function searchLiteral(repo, literal, exclude = []) {
  const r = spawnSync("git", ["-c", "core.quotepath=off", "grep", "-F", "-I", "-c", "--null", "-e", literal], { cwd: repo, encoding: "utf8", maxBuffer: 1 << 30 });
  if (r.status !== 0 && r.status !== 1) throw new Error(`git grep 失败：${r.stderr.trim()}`);
  return r.stdout.split("\n").filter(Boolean).map((line) => {
    const [file, count] = line.split("\0");
    return { file, count: Number(count) };
  }).filter((h) => !exclude.includes(h.file)).sort((a, b) => a.file.localeCompare(b.file));
}

/** 全部字面的命中，带范围判定：范围内、范围外，或没有责任分级时的未判。 */
export function findConsumers({ repo, literals, scope, exclude }) {
  const judge = (file) => (scope === null ? "未判" : covered(normalizePath(file), scope) ? "范围内" : "范围外");
  const result = literals.map((literal) => ({ literal, hits: searchLiteral(repo, literal, exclude).map((h) => ({ ...h, scope: judge(h.file) })) }));
  const outsideFiles = new Set(result.flatMap((r) => r.hits.filter((h) => h.scope === "范围外").map((h) => h.file)));
  return { literals: result, outside: outsideFiles.size };
}

/** 文本输出：每个字面一节一张表，末尾一行结论。 */
export function formatConsumers({ literals, outside }) {
  const lines = [];
  for (const { literal, hits } of literals) {
    lines.push(`## \`${literal}\``, "");
    if (hits.length === 0) lines.push("无命中");
    else lines.push("| 文件 | 命中 | 范围 |", "| --- | --- | --- |", ...hits.map((h) => `| \`${h.file}\` | ${h.count} | ${h.scope} |`));
    lines.push("");
  }
  lines.push(outside === 0 ? "范围外命中 0 个文件" : `范围外命中 ${outside} 个文件：补进责任分级（本程改动带出的消费者），或确认它不受这次改动影响`);
  return lines.join("\n");
}
