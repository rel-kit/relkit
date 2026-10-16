/**
 * Audits the SQLite metadata language evaluated by Drizzle's table inspection.
 * Extra-config and foreign-key callbacks are checked, never trusted as handlers.
 * No arbitrary calls, computed keys, defaults, getters or callback blocks qualify.
 */
import ts from "typescript";
import { isLiteralSnapshotDefault } from "./snapshot-default-eligibility.js";

type Bindings = ReadonlyMap<string, string>;
type Kind = "column" | "table" | "index" | "constraint";

/** Checks expressions rooted in the exact audited SQLite or SQL imports. */
export function assertSqliteExpression(expression: ts.Expression, bindings: Bindings): boolean {
  if (ts.isTaggedTemplateExpression(expression)) {
    if (!ts.isIdentifier(expression.tag) || bindings.get(expression.tag.text) !== "sqlite:sql")
      return false;
    if (ts.isTemplateExpression(expression.template))
      for (const span of expression.template.templateSpans)
        assertColumnReference(span.expression, bindings);
    return true;
  }
  if (!ts.isCallExpression(expression)) return false;
  let root: ts.Expression = expression.expression;
  while (ts.isPropertyAccessExpression(root) && ts.isCallExpression(root.expression))
    root = root.expression.expression;
  if (!ts.isIdentifier(root) || !bindings.get(root.text)?.startsWith("sqlite:")) return false;
  sqliteKind(expression, bindings);
  return true;
}

/** Resolves only the finite factory and builder chain supported by this policy. */
function sqliteKind(expression: ts.Expression, bindings: Bindings): Kind {
  if (!ts.isCallExpression(expression)) throw new Error("Expected SQLite construction");
  const target = expression.expression;
  const args = expression.arguments;
  if (ts.isIdentifier(target)) {
    switch (bindings.get(target.text)) {
      case "sqlite:text":
      case "sqlite:integer":
        if (args.length > 1 || !args.every(isLiteralSnapshotDefault))
          throw new Error("Dynamic column options");
        return "column";
      case "sqlite:sqliteTable":
        assertTable(args, bindings);
        return "table";
      case "sqlite:uniqueIndex":
        if (args.length !== 1 || !ts.isStringLiteral(args[0]!))
          throw new Error("Dynamic index name");
        return "index";
      case "sqlite:check":
        if (
          args.length !== 2 ||
          !ts.isStringLiteral(args[0]!) ||
          !ts.isTaggedTemplateExpression(args[1]!) ||
          !assertSqliteExpression(args[1]!, bindings)
        )
          throw new Error("Dynamic check constraint");
        return "constraint";
      case "sqlite:primaryKey":
        assertPrimaryKey(args, bindings);
        return "constraint";
    }
  }
  if (!ts.isPropertyAccessExpression(target)) throw new Error("Unaudited SQLite factory");
  const receiver = sqliteKind(target.expression, bindings);
  const method = target.name.text;
  if (receiver === "index" && method === "on" && args.length > 0) {
    for (const argument of args) assertColumnReference(argument, bindings);
    return "constraint";
  }
  if (receiver !== "column") throw new Error("Unaudited SQLite receiver");
  if (
    ["notNull", "primaryKey", "unique"].includes(method) &&
    args.length <= 1 &&
    args.every(isLiteralSnapshotDefault)
  )
    return "column";
  if (method === "default" && args.length === 1 && isLiteralSnapshotDefault(args[0]!))
    return "column";
  if (method === "references" && args.length >= 1 && args.length <= 2) {
    const callback = args[0]!;
    if (
      !ts.isArrowFunction(callback) ||
      callback.modifiers?.length ||
      callback.parameters.length !== 0 ||
      ts.isBlock(callback.body)
    )
      throw new Error("Dynamic foreign key");
    assertColumnReference(callback.body, bindings);
    if (args[1] !== undefined && !isLiteralSnapshotDefault(args[1]))
      throw new Error("Dynamic reference action");
    return "column";
  }
  throw new Error("Unaudited SQLite builder method");
}

/** Columns must be literal builders; constraint callbacks may only return audited arrays. */
function assertTable(args: readonly ts.Expression[], bindings: Bindings): void {
  if (
    args.length < 2 ||
    args.length > 3 ||
    !ts.isStringLiteral(args[0]!) ||
    !ts.isObjectLiteralExpression(args[1]!)
  )
    throw new Error("Dynamic SQLite table");
  for (const property of args[1]!.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) ||
      property.name.text === "__proto__" ||
      sqliteKind(property.initializer, bindings) !== "column"
    )
      throw new Error("Dynamic SQLite column");
  }
  const callback = args[2];
  if (callback === undefined) return;
  if (
    !ts.isArrowFunction(callback) ||
    callback.parameters.length !== 1 ||
    ts.isBlock(callback.body) ||
    !ts.isArrayLiteralExpression(callback.body) ||
    callback.modifiers?.length
  )
    throw new Error("Dynamic table metadata callback");
  const parameter = callback.parameters[0]!;
  if (
    !ts.isIdentifier(parameter.name) ||
    parameter.initializer !== undefined ||
    parameter.dotDotDotToken !== undefined
  )
    throw new Error("Dynamic table metadata parameter");
  const scoped = new Map(bindings).set(parameter.name.text, "sqlite:table-parameter");
  for (const item of callback.body.elements)
    if (sqliteKind(item, scoped) !== "constraint") throw new Error("Dynamic table metadata");
}

/** Metadata references read only direct columns of audited local tables or the callback table. */
function assertColumnReference(expression: ts.Expression, bindings: Bindings): void {
  if (
    !ts.isPropertyAccessExpression(expression) ||
    !ts.isIdentifier(expression.expression) ||
    ["__proto__", "prototype", "constructor"].includes(expression.name.text) ||
    !["local", "sqlite:table-parameter"].includes(bindings.get(expression.expression.text) ?? "")
  )
    throw new Error("Dynamic column reference");
}

/** Composite-key options contain only a column array and an optional literal name. */
function assertPrimaryKey(args: readonly ts.Expression[], bindings: Bindings): void {
  if (args.length !== 1 || !ts.isObjectLiteralExpression(args[0]!))
    throw new Error("Dynamic primary key");
  let columns = false;
  for (const property of args[0]!.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name))
      throw new Error("Dynamic primary key option");
    if (property.name.text === "name" && ts.isStringLiteral(property.initializer)) continue;
    if (property.name.text !== "columns" || !ts.isArrayLiteralExpression(property.initializer))
      throw new Error("Dynamic primary key columns");
    columns = property.initializer.elements.length > 0;
    for (const column of property.initializer.elements) assertColumnReference(column, bindings);
  }
  if (!columns) throw new Error("Missing primary key columns");
}
