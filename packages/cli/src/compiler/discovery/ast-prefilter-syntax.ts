import * as ts from "typescript";

/**
 * Checks whether an import retains runtime content.
 * @param node - Parsed syntax or its spelling to inspect.
 * @returns Whether side effects or value bindings require loading.
 */
export function isRuntimeImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined || clause.isTypeOnly) return clause === undefined;
  if (clause.name !== undefined) return true;
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    return clause.namedBindings.elements.some((element) => !element.isTypeOnly);
  }
  return true;
}

/**
 * Checks whether an export retains runtime content.
 * @param node - Parsed syntax or its spelling to inspect.
 * @returns Whether runtime values are exported.
 */
export function isRuntimeExport(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return false;
  if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) return true;
  return node.exportClause.elements.some((element) => !element.isTypeOnly);
}

/**
 * Recognizes the literal descriptor Symbol.for call.
 * @param node - Parsed syntax or its spelling to inspect.
 * @returns Whether the descriptor brand is named exactly.
 */
export function isDescriptorBrandCall(node: ts.CallExpression): boolean {
  const argument = node.arguments[0];
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "Symbol" &&
    node.expression.name.text === "for" &&
    node.arguments.length === 1 &&
    argument !== undefined &&
    ts.isStringLiteralLike(argument) &&
    argument.text === "relkit.descriptor"
  );
}

/**
 * Reads a literal runtime import or require target.
 * @param node - Parsed syntax or its spelling to inspect.
 * @returns The sole literal argument, otherwise undefined.
 */
export function runtimeModuleSpecifier(node: ts.CallExpression): string | undefined {
  const argument = node.arguments[0];
  if (
    !(
      node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require")
    ) ||
    node.arguments.length !== 1 ||
    argument === undefined ||
    !ts.isStringLiteralLike(argument)
  )
    return undefined;
  return argument.text;
}

/**
 * Reads an expression's dotted identifier spelling.
 * @param expression - Parsed syntax or its spelling to inspect.
 * @returns The identifier/property path, or an empty string.
 */
export function expressionName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const parent = expressionName(expression.expression);
    return parent === "" ? expression.name.text : `${parent}.${expression.name.text}`;
  }
  return "";
}

/**
 * Reads the last component of a dotted syntax name.
 * @param value - Parsed syntax or its spelling to inspect.
 * @returns The final non-empty component, otherwise undefined.
 */
export function lastSegment(value: string): string | undefined {
  const segment = value.split(".").at(-1);
  return segment === "" ? undefined : segment;
}

/**
 * Checks whether a declaration carries default.
 * @param node - Parsed syntax or its spelling to inspect.
 * @returns Whether a default modifier is present.
 */
export function hasDefaultModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ===
      true
  );
}

/**
 * Chooses parsing mode from a filename extension.
 * @param fileName - Parsed syntax or its spelling to inspect.
 * @returns TSX, JSX, or JSON for their extensions; TypeScript otherwise.
 */
export function scriptKind(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (fileName.endsWith(".json")) return ts.ScriptKind.JSON;
  return ts.ScriptKind.TS;
}
