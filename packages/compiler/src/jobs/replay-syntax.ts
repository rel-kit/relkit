import * as ts from "typescript";

const EXTERNAL_METHODS = new Set([
  "charge",
  "delete",
  "insert",
  "publish",
  "send",
  "update",
  "write",
]);
const ORDER_METHODS = new Set(["keys", "entries", "values"]);

/**
 * Reads a direct or property call's syntactic method name.
 * @param call - TypeScript call expression being inspected.
 * @returns the method name or undefined for another call shape.
 */
export function callName(call: ts.CallExpression): string | undefined {
  const expression = call.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
}

/**
 * Finds the explicit key property in a wait's object-literal arguments.
 * @param call - TypeScript call expression being inspected.
 * @returns the key expression or undefined when absent.
 */
export function waitKey(call: ts.CallExpression): ts.Expression | undefined {
  for (const argument of call.arguments) {
    if (!ts.isObjectLiteralExpression(argument)) continue;
    for (const property of argument.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = property.name;
      if (ts.isIdentifier(name) && name.text === "key") return property.initializer;
      if (ts.isStringLiteral(name) && name.text === "key") return property.initializer;
    }
  }
  return undefined;
}

/**
 * Checks a wait key for time, randomness, and ordering-dependent syntax.
 * @param value - Value or descriptor to inspect without coercion.
 * @returns whether unstable syntax occurs within the key expression.
 */
export function hasUnstableKey(value: ts.Node): boolean {
  let unstable = false;
  /**
   * Searches until the first unstable key expression is found.
   * @param node - Current key syntax node.
   * @returns Nothing; updates the bounded traversal's unstable flag.
   */
  const visit = (node: ts.Node): void => {
    if (unstable) return;
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Date"
    ) {
      unstable = true;
      return;
    }
    if (ts.isIdentifier(node) && ["randomUUID", "randomBytes"].includes(node.text)) {
      unstable = true;
      return;
    }
    if (ts.isPropertyAccessExpression(node)) {
      const object = node.expression;
      if (
        (ts.isIdentifier(object) &&
          ["Date", "Math", "crypto"].includes(object.text) &&
          ["now", "random", "randomUUID", "randomBytes"].includes(node.name.text)) ||
        ORDER_METHODS.has(node.name.text)
      ) {
        unstable = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(value);
  return unstable;
}

/**
 * Recognizes known external operations for warning-only replay analysis.
 * @param call - TypeScript call expression being inspected.
 * @returns whether a call is potentially external work.
 */
export function isExternalCall(call: ts.CallExpression): boolean {
  const expression = call.expression;
  if (ts.isIdentifier(expression)) return expression.text === "fetch";
  if (!ts.isPropertyAccessExpression(expression)) return false;
  return (
    EXTERNAL_METHODS.has(expression.name.text) ||
    (ts.isIdentifier(expression.expression) && expression.expression.text === "axios")
  );
}
