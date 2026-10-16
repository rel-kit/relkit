/** Proves asTool receivers from explicit defineFunction declarations in captured source. */
import { posix } from "node:path";
import ts from "typescript";

/** Recognizes a descriptor value without evaluating a function or following object properties. */
export function isSnapshotFunctionValue(
  value: ts.Expression,
  bindings: ReadonlyMap<string, string>,
): boolean {
  if (
    ts.isParenthesizedExpression(value) ||
    ts.isAsExpression(value) ||
    ts.isSatisfiesExpression(value)
  )
    return isSnapshotFunctionValue(value.expression, bindings);
  return ts.isIdentifier(value)
    ? bindings.get(value.text) === "function-descriptor"
    : ts.isCallExpression(value) &&
        ts.isIdentifier(value.expression) &&
        bindings.get(value.expression.text) === "defineFunction";
}

/** Resolves only unambiguous source members; missing provenance rejects prepared eligibility. */
export function isSnapshotFunctionImport(
  module: string,
  name: string,
  path: string,
  sources: ReadonlyMap<string, string>,
  visiting: ReadonlySet<string> = new Set(),
): boolean {
  const resolved = module.startsWith("@app/")
    ? posix.normalize(`src/${module.slice(5)}`)
    : posix.normalize(posix.join(posix.dirname(path), module));
  const candidates = [
    ...new Set([
      resolved,
      resolved.replace(/\.js$/, ".ts"),
      resolved.replace(/\.js$/, ".tsx"),
      resolved.replace(/\.mjs$/, ".mts"),
      resolved.replace(/\.cjs$/, ".cts"),
    ]),
  ].filter((candidate) => sources.has(candidate));
  if (candidates.length !== 1) return false;
  const target = candidates[0]!;
  const identity = `${target}:${name}`;
  if (visiting.has(identity)) return false;
  const seen = new Set(visiting).add(identity);
  const file = ts.createSourceFile(target, sources.get(target)!, ts.ScriptTarget.Latest, true);
  const bindings = new Map<string, string>();
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (clause === undefined || clause.isTypeOnly || statement.attributes !== undefined) continue;
      const imported = statement.moduleSpecifier.text;
      if (
        clause.name !== undefined &&
        isSnapshotFunctionImport(imported, "default", target, sources, seen)
      )
        bindings.set(clause.name.text, "function-descriptor");
      if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings))
        for (const element of clause.namedBindings.elements) {
          if (element.isTypeOnly) continue;
          const original = element.propertyName?.text ?? element.name.text;
          if (imported === "@relkit/app/functions" && original === "defineFunction")
            bindings.set(element.name.text, "defineFunction");
          else if (isSnapshotFunctionImport(imported, original, target, sources, seen))
            bindings.set(element.name.text, "function-descriptor");
        }
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue;
        const descriptor =
          (statement.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
          isSnapshotFunctionValue(declaration.initializer, bindings);
        bindings.set(declaration.name.text, descriptor ? "function-descriptor" : "local");
        if (
          descriptor &&
          declaration.name.text === name &&
          statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
        )
          return true;
      }
    }
    if (name === "default" && ts.isExportAssignment(statement) && !statement.isExportEquals)
      return isSnapshotFunctionValue(statement.expression, bindings);
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier === undefined &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    )
      for (const element of statement.exportClause.elements)
        if (!element.isTypeOnly && element.name.text === name)
          return (
            bindings.get(element.propertyName?.text ?? element.name.text) === "function-descriptor"
          );
  }
  return false;
}
