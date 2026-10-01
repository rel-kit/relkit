import * as ts from "typescript";

/**
 * Reads the local target of a service member property.
 * @param property - Parsed syntax to inspect without evaluation.
 * @returns A local identifier for shorthand or identifier-valued properties, otherwise undefined.
 */
export function memberTarget(property: ts.ObjectLiteralElementLike): string | undefined {
  if (ts.isShorthandPropertyAssignment(property)) return property.name.text;
  return ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer)
    ? property.initializer.text
    : undefined;
}

/**
 * Reads a literal TypeScript property name.
 * @param name - Parsed syntax to inspect without evaluation.
 * @returns The literal spelling, or undefined for computed or missing names.
 */
export function propertyName(name: ts.PropertyName | undefined): string | undefined {
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

/**
 * Reads the terminal identifier of a call target.
 * @param expression - Parsed syntax to inspect without evaluation.
 * @returns The identifier or property spelling, otherwise undefined.
 */
export function lastSegment(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

/** Resolves named RELKIT import aliases before classifying a factory call. */
export function factoryName(expression: ts.Expression): string | undefined {
  const name = lastSegment(expression);
  if (!ts.isIdentifier(expression)) return name;
  for (const statement of expression.getSourceFile()?.statements ?? []) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.startsWith("@relkit/")
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const imported = bindings.elements.find((entry) => entry.name.text === name);
    if (imported) return (imported.propertyName ?? imported.name).text;
  }
  return name;
}

/**
 * Removes syntax-only assertions and parentheses.
 * @param value - Parsed syntax to inspect without evaluation.
 * @returns The innermost expression without evaluating it.
 */
export function unwrap(value: ts.Expression | undefined): ts.Expression | undefined {
  let current = value;
  while (
    current !== undefined &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}
