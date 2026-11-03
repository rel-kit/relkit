import ts from "typescript";

/**
 * Selects a named property from an object literal.
 * @param object - Object literal containing the requested property.
 * @param name - Declared binding or parameter name.
 * @returns The matching object property expression, or undefined.
 */
export function field(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  const property = object.properties.find((item) => item.name?.getText() === name);
  return property && ts.isPropertyAssignment(property)
    ? property.initializer
    : property && ts.isShorthandPropertyAssignment(property)
      ? property.name
      : undefined;
}

/**
 * Removes parenthesized and assertion syntax from an expression.
 * @param value - Declared metadata inspected without coercion.
 * @returns The expression without assertion or parenthesis wrappers.
 */
export function unwrap(value: ts.Expression): ts.Expression {
  while (
    ts.isAsExpression(value) ||
    ts.isParenthesizedExpression(value) ||
    ts.isNonNullExpression(value) ||
    ts.isSatisfiesExpression(value)
  )
    value = value.expression;
  return value;
}

/**
 * Resolves a TypeScript property type at its source node.
 * @param type - TypeScript type being inspected.
 * @param key - Property or stable lookup key.
 * @param checker - TypeScript program type checker.
 * @param node - Parsed source node or normalized graph node.
 * @returns The property's TypeScript type, or undefined.
 */
export function property(
  type: ts.Type,
  key: string,
  checker: ts.TypeChecker,
  node: ts.Node,
): ts.Type | undefined {
  const symbol = type.getProperty(key);
  return symbol && checker.getTypeOfSymbolAtLocation(symbol, node);
}

/**
 * Checks whether a function's TypeScript contract is event-only.
 * @param node - Parsed source node or normalized graph node.
 * @param checker - TypeScript program type checker.
 * @returns True when the function type declares event-only execution.
 */
export function eventOnly(node: ts.Node, checker: ts.TypeChecker): boolean {
  const mode = property(checker.getTypeAtLocation(node), "invocationMode", checker, node);
  return mode?.isStringLiteral() === true && mode.value === "event-only";
}

/**
 * Reads the literal stable identity from a TypeScript descriptor type.
 * @param node - Parsed source node or normalized graph node.
 * @param checker - TypeScript program type checker.
 * @returns The descriptor type's literal stable identity.
 */
export function identity(node: ts.Node, checker: ts.TypeChecker): string {
  const id = property(checker.getTypeAtLocation(node), "id", checker, node);
  return id?.isStringLiteral() ? id.value : node.getText();
}

/**
 * Resolves the authoring factory name for a call expression.
 * @param node - Parsed source node or normalized graph node.
 * @param checker - TypeScript program type checker.
 * @returns The imported or property-qualified authoring factory name.
 */
export function factoryName(node: ts.Expression, checker: ts.TypeChecker): string {
  let symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node) ? node.name : node);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return symbol?.name ?? node.getText();
}

/**
 * Checks whether a TypeScript result permits only void or branded errors.
 * @param type - TypeScript type being inspected.
 * @param checker - TypeScript program type checker.
 * @param node - Parsed source node or normalized graph node.
 * @returns True when the TypeScript type represents void or the permitted error result.
 */
export function voidOrError(type: ts.Type, checker: ts.TypeChecker, node: ts.Node): boolean {
  const result = checker.getAwaitedType(type) ?? type;
  if (result.isUnion()) return result.types.every((part) => voidOrError(part, checker, node));
  if (
    result.flags &
    (ts.TypeFlags.Void |
      ts.TypeFlags.Undefined |
      ts.TypeFlags.Never |
      ts.TypeFlags.Any |
      ts.TypeFlags.Unknown)
  )
    return true;
  const effect = property(result, "~effect/Effect", checker, node);
  if (effect) {
    const output = property(effect, "_A", checker, node)?.getCallSignatures()[0];
    return (
      output !== undefined && voidOrError(checker.getReturnTypeOfSignature(output), checker, node)
    );
  }
  // The normal function contract validator checks declared error identity and Effect error channels.
  return (
    (result.getProperty("message") !== undefined && result.getProperty("name") !== undefined) ||
    (property(result, "_tag", checker, node)?.isStringLiteral() === true &&
      checker.typeToString(property(result, "_tag", checker, node)!) === '"FunctionFailure"')
  );
}
