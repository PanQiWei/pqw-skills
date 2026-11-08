// TypeScript 与 JavaScript 适配器：把源码变成 ../metrics-model.md 里的单元与位点。
// 出处：unclebob/crapper 提交 6fd92c4 的 languages/typescript.py（判定集合），unclebob/mutator 提交 a5a0cb8（位点类别）；两者 0BSD。
// 判定集合 D：if、三元、for、for-in、for-of、while、do、catch、case、default、&&、||、??、?.
// 计分单元：有名字、有函数体的函数与方法；有名字的内层函数、对象字面量方法与类字段箭头函数各自成单元，匿名回调并入外层（omne 的划分）。
// 计数范围与 omne 所钉的 crapper 4909ad2 不同，两边的读数不能直接比。
// 认知复杂度按 SonarSource 白皮书：分叉结构 +1，嵌套再加深度，逻辑运算序列每换一种 +1，else 与 else-if 各 +1 不加嵌套。
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const SOURCE_RE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
export const DECLARATION_RE = /\.d\.[cm]?ts$/;

/** 加载 typescript：显式路径，否则从项目目录的 node_modules 解析。找不到抛错，调用方写「未提供」。 */
export function loadTypescript(explicit, cwd = process.cwd()) {
  const req = createRequire(join(cwd, "noop.js"));
  const candidate = explicit ?? "typescript";
  try {
    const ts = req(candidate);
    if (typeof ts.createSourceFile !== "function") throw new Error("not a parser");
    return ts;
  } catch (e) {
    throw new Error(`未提供：找不到可用的 typescript（${explicit ?? "项目 node_modules"}）。用 --ts 指定 typescript 包目录。`);
  }
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
