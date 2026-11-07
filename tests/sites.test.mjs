import { test } from "node:test";
import assert from "node:assert/strict";
import { tsPath } from "./fixture.mjs";
import { ownLines, nestedUnits } from "../skills/slice-closeout/scripts/lib/core.mjs";

const TS = tsPath();
const skip = TS ? false : "没有 typescript，设 PQW_TS";

async function sitesOf(src, unitName) {
  const { loadTypescript, analyze, sites } = await import("../skills/slice-closeout/scripts/lib/adapter-typescript.mjs");
  const ts = loadTypescript(TS);
  const { sourceFile, units } = analyze(ts, "x.ts", src);
  const unit = units.find((u) => u.name === unitName);
  const own = new Set(ownLines(unit, nestedUnits(unit, units)));
  return sites(ts, sourceFile, src, unit, own).map((s) => [s.line, s.anchorLine, s.original, s.mutant, s.category]);
}

test("七类位点各一例，anchorLine 是语句起始行", { skip }, async () => {
  const src = `export function f(a: number, b?: { c(): number }, d?: boolean) {\n  const ok =\n    a <= 3 && d === true;\n  const n = b?.c() ?? a;\n  return !ok ? n * 2 : n;\n}\n`;
  const got = await sitesOf(src, "f");
  assert.deepEqual(got, [
    [3, 2, "<=", "<", "relational"],
    [3, 2, "&&", "||", "logical"],
    [3, 2, "===", "!==", "equality"],
    [3, 2, "true", "false", "boolean"],
    [4, 4, "?.", ".", "optional"],
    [4, 4, "??", "||", "logical"],
    [5, 5, "!", "", "negation"],
    [5, 5, "*", "/", "arithmetic"],
  ]);
});

test("位点只落在本单元自己的行：不含相邻函数，不含内层有名函数", { skip }, async () => {
  const src = `function a(x: number) { return x > 1; }\nfunction b(y: number) {\n  function inner(z: number) { return z < 2; }\n  return inner(y) && y >= 3;\n}\nfunction c(w: number) { return w !== 4; }\n`;
  assert.deepEqual(await sitesOf(src, "b"), [[4, 4, "&&", "||", "logical"], [4, 4, ">=", ">", "relational"]]);
  assert.deepEqual(await sitesOf(src, "b.inner"), [[3, 3, "<", "<=", "relational"]]);
  assert.deepEqual(await sitesOf(src, "c"), [[6, 6, "!==", "===", "equality"]]);
});

test("属性可选链换成点，调用与下标的可选链删去", { skip }, async () => {
  const got = await sitesOf(`function g(o?: { p?: number[]; q?(): void }) { o?.q?.(); return o?.p?.[0]; }\n`, "g");
  assert.deepEqual(got.map((s) => [s[2], s[3]]), [["?.", "."], ["?.", ""], ["?.", "."], ["?.", ""]]);
});
