import { test } from "node:test";
import assert from "node:assert/strict";
import { tsPath } from "./fixture.mjs";

const TS = tsPath();
const skip = TS ? false : "没有 typescript，设 PQW_TS";

async function units(src) {
  const { loadTypescript, analyze } = await import("../skills/slice-closeout/scripts/lib/adapter-typescript.mjs");
  const ts = loadTypescript(TS);
  return analyze(ts, "x.ts", src).units;
}

test("认知复杂度：嵌套 if 按深度加", { skip }, async () => {
  const [u] = await units(`function f(a: boolean, b: boolean) {\n  if (a) {\n    if (b) { return 1; }\n  }\n  return 0;\n}\n`);
  assert.equal(u.cyclomatic, 3);
  assert.equal(u.cognitive, 3);
});

test("认知复杂度：逻辑运算符序列每换一种加一；else 不加嵌套", { skip }, async () => {
  const [u] = await units(`function f(a: boolean, b: boolean, c: boolean, d: boolean) {\n  if (a && b && c || d) { return 1; } else { return 2; }\n}\n`);
  assert.equal(u.cyclomatic, 5);
  assert.equal(u.cognitive, 4);
});

test("计分单元：匿名回调并入外层，有名内层函数独立", { skip }, async () => {
  const us = await units(`export const h = (xs: number[]) => xs.filter((x) => x > 0 && x < 9);\nclass K { m(a: number) { return a ? 1 : 2; } }\n`);
  assert.deepEqual(us.map((u) => [u.name, u.cyclomatic]), [["h", 2], ["K.m", 2]]);
});
