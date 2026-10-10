/**
 * Proves schema defaults are literal data rather than borrowed runtime callbacks.
 * General descriptor references are valid route targets, but allowing those same
 * references in defaults can execute a handler while serializing compilation data.
 * This pure AST guard evaluates no application source or environment value.
 */
import ts from "typescript";

/**
 * Checks a bounded parsed default expression for literal JSON construction only.
 * @param expression - Default argument from an approved schema or environment factory.
 * @returns True for literal data; callback/property/ambient references are ineligible.
 */
export function isLiteralSnapshotDefault(expression: ts.Expression): boolean {
  if (ts.isStringLiteral(expression) || ts.isNumericLiteral(expression)) return true;
  if (
    [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
      expression.kind,
    )
  )
    return true;
  if (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  )
    return isLiteralSnapshotDefault(expression.expression);
  if (ts.isArrayLiteralExpression(expression))
    return expression.elements.every(isLiteralSnapshotDefault);
  if (!ts.isObjectLiteralExpression(expression)) return false;
  return expression.properties.every((property) => {
    if (!ts.isPropertyAssignment(property)) return false;
    if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) return false;
    return property.name.text !== "__proto__" && isLiteralSnapshotDefault(property.initializer);
  });
}
