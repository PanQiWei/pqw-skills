import { test } from "vitest";
import assert from "node:assert/strict";
import { tsPath } from "./fixture.mjs";

const TS = tsPath();
const skip = TS ? false : "没有 typescript，设 PQW_TS";

async function units(src) {
  const { loadTypescript, analyze } = await import("../skills/slice-closeout/scripts/lib/adapter-typescript.mjs");
  const ts = loadTypescript(TS);
  return analyze(ts, "x.ts", src).units;
}

test.skipIf(skip)("认知复杂度：嵌套 if 按深度加", async () => {
  const [u] = await units(`function f(a: boolean, b: boolean) {\n  if (a) {\n    if (b) { return 1; }\n  }\n  return 0;\n}\n`);
  assert.equal(u.cyclomatic, 3);
  assert.equal(u.cognitive, 3);
});

test.skipIf(skip)("认知复杂度：逻辑运算符序列每换一种加一；else 不加嵌套", async () => {
  const [u] = await units(`function f(a: boolean, b: boolean, c: boolean, d: boolean) {\n  if (a && b && c || d) { return 1; } else { return 2; }\n}\n`);
  assert.equal(u.cyclomatic, 5);
  assert.equal(u.cognitive, 4);
});

test.skipIf(skip)("认知复杂度：else-if 链每段 +1，链尾 else 也 +1：三段记 3、四段记 4、只有 if 与 else 记 2", async () => {
  const three = await units(`function f(a: number) {\n  if (a > 1) { return 1; } else if (a > 0) { return 2; } else { return 3; }\n}\n`);
  assert.equal(three[0].cognitive, 3);
  const four = await units(`function f(a: number) {\n  if (a > 2) { return 1; } else if (a > 1) { return 2; } else if (a > 0) { return 3; } else { return 4; }\n}\n`);
  assert.equal(four[0].cognitive, 4);
  const two = await units(`function f(a: number) {\n  if (a > 0) { return 1; } else { return 2; }\n}\n`);
  assert.equal(two[0].cognitive, 2);
  const chainNoElse = await units(`function f(a: number) {\n  if (a > 1) { return 1; } else if (a > 0) { return 2; }\n  return 3;\n}\n`);
  assert.equal(chainNoElse[0].cognitive, 2, "没有链尾 else 不加");
});

test.skipIf(skip)("计分单元：匿名回调并入外层，有名内层函数独立", async () => {
  const us = await units(`export const h = (xs: number[]) => xs.filter((x) => x > 0 && x < 9);\nclass K { m(a: number) { return a ? 1 : 2; } }\n`);
  assert.deepEqual(us.map((u) => [u.name, u.cyclomatic]), [["h", 2], ["K.m", 2]]);
  const [deep] = await units(`export const g = (xs: number[]) => xs.map((x) => x > 0 ? x : 0);\n`);
  assert.equal(deep.cognitive, 2, "匿名回调里的分叉按嵌套深度 1 计");
});
