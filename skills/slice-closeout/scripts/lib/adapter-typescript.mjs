// TypeScript 与 JavaScript 适配器：把源码变成 ../metrics-model.md 里的单元与位点。
// 出处：unclebob/crapper 提交 6fd92c4 的 languages/typescript.py（判定集合），unclebob/mutator 提交 a5a0cb8（位点类别）；两者 0BSD。
// 判定集合 D：if、三元、for、for-in、for-of、while、do、catch、case、default、&&、||、??、?.
// 计分单元：有名字、有函数体的函数与方法；有名字的内层函数、对象字面量方法与类字段箭头函数各自成单元，匿名回调并入外层（omne 的划分）。
// 计数范围与 omne 所钉的 crapper 4909ad2 不同，两边的读数不能直接比。
// 认知复杂度按 SonarSource 白皮书：分叉结构 +1，嵌套再加深度，逻辑运算序列每换一种 +1，else 与 else-if 各 +1 不加嵌套。
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

export const SOURCE_RE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
export const DECLARATION_RE = /\.d\.[cm]?ts$/;

/** 从 start 起逐级往上的 node_modules/typescript（与 Node 的查找同序）。 */
function walkUp(start) {
  const dirs = [];
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    dirs.push(join(dir, "node_modules", "typescript"));
    if (dirname(dir) === dir) return dirs;
  }
}

/** 版本分量，按数字比：6.0.10 高于 6.0.9。 */
const versionParts = (v) => (v ?? "").split(/[.+-]/).slice(0, 3).map((n) => Number(n) || 0);
const byVersionDesc = (a, b) => { const [x, y] = [versionParts(a.version), versionParts(b.version)]; return (y[0] - x[0]) || (y[1] - x[1]) || (y[2] - x[2]); };

/** pnpm 存储里的 typescript：<根>/node_modules/.pnpm/typescript@*\/node_modules/typescript，版本取自各自的 package.json，高的在前。 */
function pnpmStoreCandidates(root) {
  const store = join(root, "node_modules", ".pnpm");
  if (!existsSync(store)) return [];
  return readdirSync(store).filter((n) => n.startsWith("typescript@")).map((n) => join(store, n, "node_modules", "typescript")).filter((d) => existsSync(join(d, "package.json")))
    .map((dir) => ({ dir, version: versionAt(dir) })).sort(byVersionDesc).map((c) => c.dir);
}

function versionAt(dir) {
  try { return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version ?? null; } catch { return null; }
}

/** 包目录里有 JS 接口（能 require 且 createSourceFile 是函数）就返回模块，否则 null。typescript 7 起是原生实现，npm 包里没有 JS 接口。 */
function parserAt(dir) {
  try {
    const ts = createRequire(import.meta.url)(dir);
    return typeof ts.createSourceFile === "function" ? ts : null;
  } catch { return null; }
}

/**
 * 加载 typescript：显式路径，否则按 Git 根（含往上各级）、成员目录（给了才找）、Git 根的 pnpm 存储依次找，
 * 每处只收有 JS 接口的，没有接口的记下路径与版本继续往后找；存储里取有 JS 接口的最高版本。
 * 找不到抛错，调用方写「未提供」：没装、或装了但都没有 JS 接口（消息写出路径与版本，说明用 --ts 指到一个 6.x）。
 */
export function loadTypescript(explicit, cwd = process.cwd(), projectDir = null) {
  if (explicit !== undefined && explicit !== null) {
    const ts = parserAt(resolve(cwd, explicit));
    if (ts) return ts;
    throw new Error(`未提供：找不到可用的 typescript（${explicit}）。用 --ts 指定 typescript 包目录。`);
  }
  const searched = [...walkUp(cwd), ...(projectDir ? walkUp(projectDir) : []), ...pnpmStoreCandidates(cwd)];
  const found = [];
  for (const dir of [...new Set(searched)]) {
    if (!existsSync(join(dir, "package.json"))) continue;
    const ts = parserAt(dir);
    if (ts) return ts;
    found.push(`${dir}（${versionAt(dir) ?? "版本不明"}）`);
  }
  if (found.length) throw new Error(`未提供：找到 typescript 但没有 JS 接口：${found.join("、")}。typescript 7 起是原生实现，npm 包里没有 JS 接口；用 --ts 指到一个 6.x 的包目录（例如 pnpm 存储里的 node_modules/.pnpm/typescript@6.*/node_modules/typescript）。`);
  throw new Error(`未提供：找不到 typescript（找过 ${join(cwd, "node_modules")}${projectDir ? `、${join(projectDir, "node_modules")}` : ""}、${join(cwd, "node_modules", ".pnpm")}）。用 --ts 指定 typescript 包目录。`);
}

const scriptKind = (ts, path) => (/\.tsx$/.test(path) ? ts.ScriptKind.TSX : /\.jsx$/.test(path) ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS);

function nodeName(ts, name) {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function unitName(ts, node, sf) {
  const text = (n) => nodeName(ts, n) ?? n?.getText(sf);
  if (ts.isFunctionDeclaration(node)) return node.body ? (node.name?.text ?? "default") : undefined;
  if (ts.isConstructorDeclaration(node)) return node.body ? "constructor" : undefined;
  if (ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) return node.body ? text(node.name) : undefined;
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const p = node.parent;
    if (ts.isVariableDeclaration(p) && p.initializer === node) return nodeName(ts, p.name);
    if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) && p.initializer === node) return text(p.name);
  }
  return undefined;
}

function containerName(ts, node, sf) {
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return node.name?.text;
  if (!ts.isObjectLiteralExpression(node)) return undefined;
  const p = node.parent;
  if (ts.isVariableDeclaration(p) && p.initializer === node) return nodeName(ts, p.name);
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) && p.initializer === node) return nodeName(ts, p.name) ?? p.name.getText(sf);
  return undefined;
}

const LOGICAL = (ts) => new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]);

function isDecision(ts, node) {
  const K = ts.SyntaxKind;
  switch (node.kind) {
    case K.IfStatement: case K.ConditionalExpression: case K.ForStatement: case K.ForInStatement: case K.ForOfStatement:
    case K.WhileStatement: case K.DoStatement: case K.CatchClause: case K.CaseClause: case K.DefaultClause: return true;
    default:
      if (ts.isBinaryExpression(node) && LOGICAL(ts).has(node.operatorToken.kind)) return true;
      return (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node)) && node.questionDotToken !== undefined;
  }
}

/** 链尾的 else（不是 else-if）记 1；链上每个 if 都看自己的 else，所以三段链记 3、四段记 4。 */
const trailingElse = (ts, node) => (ts.isIfStatement(node) && node.elseStatement && !ts.isIfStatement(node.elseStatement) ? 1 : 0);

/** 认知复杂度的分叉结构：是否加嵌套。else 与 else-if 加 1 不加嵌套。 */
function cognitiveStep(ts, node, parent) {
  const K = ts.SyntaxKind;
  switch (node.kind) {
    case K.IfStatement:
      if (parent && ts.isIfStatement(parent) && parent.elseStatement === node) return { inc: 1, nest: false, elseIf: true };
      return { inc: 1, nest: true };
    case K.ConditionalExpression: case K.SwitchStatement: case K.ForStatement: case K.ForInStatement: case K.ForOfStatement:
    case K.WhileStatement: case K.DoStatement: case K.CatchClause: return { inc: 1, nest: true };
    default: return null;
  }
}

/** 单元列表，每个含 cyclomatic 与 cognitive。 */
export function analyze(ts, path, text) {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(ts, path));
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const logical = LOGICAL(ts);
  const units = [];
  const moduleUnit = { name: "<module>", namespace: "", startLine: 1, endLine: lineOf(sf.getEnd()), startByte: 0, endByte: sf.getEnd(), cyclomatic: 1, cognitive: 0 };

  // depth：本节点的子孙里的分叉结构要加的嵌套深度。
  const walk = (node, qualifiers, unit, depth, parent) => {
    let q = qualifiers; let u = unit; let childDepth = depth;
    const name = unitName(ts, node, sf);
    if (name !== undefined) {
      q = [...qualifiers, name];
      u = { name: q.join("."), namespace: qualifiers.join("."), startLine: lineOf(node.getStart(sf)), endLine: lineOf(node.getEnd()), startByte: node.getStart(sf), endByte: node.getEnd(), cyclomatic: 1, cognitive: 0 };
      units.push(u);
      childDepth = 0;
    } else {
      const c = containerName(ts, node, sf);
      if (c !== undefined) q = [...qualifiers, c];
      else if (ts.isBinaryExpression(node) && logical.has(node.operatorToken.kind)) {
        u.cyclomatic += 1;
        const pk = parent && ts.isBinaryExpression(parent) && logical.has(parent.operatorToken.kind) ? parent.operatorToken.kind : null;
        if (pk !== node.operatorToken.kind) u.cognitive += 1;
      } else {
        if (isDecision(ts, node)) u.cyclomatic += 1;
        const step = cognitiveStep(ts, node, parent);
        if (step?.elseIf) { u.cognitive += 1 + trailingElse(ts, node); }
        else if (step) { u.cognitive += 1 + depth + trailingElse(ts, node); childDepth = depth + 1; }
        else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) childDepth = depth + 1;
      }
    }
    ts.forEachChild(node, (child) => walk(child, q, u, childDepth, node));
  };
  walk(sf, [], moduleUnit, 0, null);
  if (moduleUnit.cyclomatic > 1) units.unshift(moduleUnit);
  return { sourceFile: sf, units };
}

// ---- 没有断言的用例。认法：被调用者是 test 或 it（含 .skip、.only、.skipIf(x)、.each(rows) 这类链）且有函数实参的调用是用例；
// 回调体里任一调用的被调用者最左标识符匹配断言模式就算有断言。describe 不是用例。

/** 被调用者链最左的标识符名：`test.skipIf(x)(…)` 与 `assert.deepEqual(…)` 都往左走到头；不是标识符返回 null。 */
function calleeHead(ts, expr) {
  let e = expr;
  for (;;) {
    if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) e = e.expression;
    else if (ts.isCallExpression(e)) e = e.expression;
    else if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e)) e = e.expression;
    else break;
  }
  return ts.isIdentifier(e) ? e.text : null;
}

const TEST_HEADS = new Set(["test", "it"]);
const isFunctionArg = (ts, a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a);

/** 节点树里有没有被调用者首段匹配 pattern 的调用（递归，嵌套函数里的也算：断言常在循环与回调里）。 */
function hasAssertion(ts, node, pattern) {
  if (ts.isCallExpression(node)) { const head = calleeHead(ts, node.expression); if (head !== null && pattern.test(head)) return true; }
  return ts.forEachChild(node, (child) => (hasAssertion(ts, child, pattern) ? true : undefined)) === true;
}

/** 改动的测试文件里没有断言的用例：[{ name, startLine, endLine }]。名字取第一个字符串字面量实参，没有写 <匿名>。 */
export function testsWithoutAssertions(ts, path, text, pattern = /^(assert|expect)$/) {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(ts, path));
  // 解析器容错，语法错不抛；这里不猜残缺的树，把第一条语法错报出去，调用方记「解析失败」。
  const bad = sf.parseDiagnostics?.[0];
  if (bad) throw new Error(`${sf.getLineAndCharacterOfPosition(bad.start ?? 0).line + 1} 行：${ts.flattenDiagnosticMessageText(bad.messageText, " ")}`);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const found = [];
  const walk = (node) => {
    if (ts.isCallExpression(node) && TEST_HEADS.has(calleeHead(ts, node.expression))) {
      const fn = node.arguments.find((a) => isFunctionArg(ts, a));
      if (fn) {
        const literal = node.arguments.find((a) => ts.isStringLiteralLike(a));
        if (!hasAssertion(ts, fn, pattern)) found.push({ name: literal ? literal.text : "<匿名>", startLine: lineOf(node.getStart(sf)), endLine: lineOf(node.getEnd()) });
        return;
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return found;
}
