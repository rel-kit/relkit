import * as ts from "typescript";

import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
/**
 * Requires exactly one factory call with a static object argument.
 * @param file - TypeScript SourceFile AST.
 * @param factories - Supported final segments of factory call names.
 * @param argumentIndex - Zero-based factory argument containing its options object.
 * @returns The unique object literal; ambiguous/nonliteral source raises the unsupported-source error.
 */
export function factoryObject(
  file: ts.SourceFile,
  factories: readonly string[],
  argumentIndex = 0,
): ts.ObjectLiteralExpression {
  const matches: ts.ObjectLiteralExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && factories.includes(lastSegment(node.expression))) {
      const argument = unwrap(node.arguments[argumentIndex]);
      if (!argument || !ts.isObjectLiteralExpression(argument)) unsupported(file.fileName);
      matches.push(argument);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (matches.length !== 1) unsupported(file.fileName);
  return matches[0]!;
}

/**
 * Finds a nested literal object or plans its missing final member container.
 * @param root - Root object-literal AST.
 * @param path - Nested static property names to traverse.
 * @param source - Authored source text inspected or transformed without execution.
 * @param memberSource - Source of the object member to insert.
 * @returns The existing target object or missing final-container projection needed for insertion.
 */
export function descend(
  root: ts.ObjectLiteralExpression,
  path: readonly string[],
  source: string,
  memberSource: string,
): {
  readonly object: ts.ObjectLiteralExpression;
  readonly parent?: ts.ObjectLiteralExpression;
  readonly name: string;
  readonly created: boolean;
} {
  let object = root;
  for (const [index, name] of path.entries()) {
    assertObject(object, source);
    const found = property(object, name);
    if (found === undefined) {
      if (index !== path.length - 1) unsupported("nested object");
      return { object, parent: object, name, created: true };
    }
    if (!ts.isPropertyAssignment(found)) unsupported(name);
    const value = unwrap(found.initializer);
    if (!value || !ts.isObjectLiteralExpression(value)) unsupported(name);
    object = value;
  }
  return { object, name: path.at(-1) ?? memberSource, created: false };
}

/**
 * Inserts a static object member without reprinting the source file.
 * @param source - Authored source text inspected or transformed without execution.
 * @param object - Object-literal AST whose properties are inspected.
 * @param member - Source of the object member to insert.
 * @returns Source with one member inserted while preserving surrounding formatting.
 */
export function insertMember(
  source: string,
  object: ts.ObjectLiteralExpression,
  member: string,
): string {
  const close = object.getEnd() - 1;
  const body = source.slice(object.getStart() + 1, close);
  if (object.properties.length === 0) {
    return `${source.slice(0, object.getStart() + 1)} ${member} ${source.slice(close)}`;
  }
  if (!body.includes("\n")) {
    const last = object.properties.at(-1)!;
    return `${source.slice(0, last.getEnd())}, ${member}${source.slice(last.getEnd())}`;
  }
  const last = object.properties.at(-1)!;
  const between = source.slice(last.getEnd(), close);
  const comma = between.trimStart().startsWith(",") ? "" : ",";
  const lineStart = source.lastIndexOf("\n", close - 1) + 1;
  const closeIndent = source.slice(lineStart, close);
  return `${source.slice(0, last.getEnd())}${comma}${source.slice(last.getEnd(), close)}${closeIndent}  ${member},\n${closeIndent}${source.slice(close)}`;
}

/**
 * Rejects object spreads and dynamic member names before source editing.
 * @param object - Object-literal AST whose properties are inspected.
 * @param source - Authored source text inspected or transformed without execution.
 * @returns Completion after the existing contract has been applied.
 */
export function assertObject(object: ts.ObjectLiteralExpression, source: string): void {
  for (const item of object.properties) {
    if (ts.isSpreadAssignment(item) || staticPropertyName(item.name) === undefined) {
      unsupported(source.slice(item.getStart(), item.getEnd()));
    }
  }
}

/**
 * Finds one statically named property in an object literal.
 * @param object - Object-literal AST whose direct properties are inspected.
 * @param name - Static property name to match.
 * @returns The matching property, or undefined when absent.
 */
export function property(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.ObjectLiteralElementLike | undefined {
  return object.properties.find((item) => staticPropertyName(item.name) === name);
}

/**
 * Parses TypeScript for source inspection without executing the application.
 * @param fileName - Source path used in parser diagnostics.
 * @param source - Authored TypeScript source text.
 * @returns The SourceFile AST; parse errors raise the canonical unsupported-source error.
 */
export function parse(fileName: string, source: string): ts.SourceFile {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const diagnostics = (
    file as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  if (diagnostics?.length) unsupported(fileName);
  return file;
}

/**
 * Removes parentheses and TypeScript assertions from a source expression.
 * @param value - AST expression whose static wrapper nodes are ignored.
 * @returns The underlying expression, or undefined when no expression was supplied.
 */
export function unwrap(value: ts.Expression | undefined): ts.Expression | undefined {
  let current = value;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current))
  )
    current = current.expression;
  return current;
}

/**
 * Reads the statically named final segment of a factory expression.
 * @param expression - Factory expression whose final identifier is inspected.
 * @returns The identifier or final property segment, otherwise an empty string.
 */
export function lastSegment(expression: ts.Expression): string {
  return ts.isIdentifier(expression)
    ? expression.text
    : ts.isPropertyAccessExpression(expression)
      ? expression.name.text
      : "";
}

/**
 * Rejects an object member that conflicts with the requested source insertion.
 * @param fileName - Source path used for declaration diagnostics.
 * @param path - Nested static property names identifying the conflicting member.
 * @returns No value; throws AddScaffoldError with RELKIT_ADD_COLLISION.
 */
export function collision(fileName: string, path: readonly string[]): never {
  throw new AddScaffoldError(
    ADD_FAILURE_CODES.collision,
    `${fileName} already declares ${path.join(".")}.`,
  );
}

/**
 * Rejects a canonical object that cannot be edited safely.
 * @param label - Human-readable location included in validation diagnostics.
 * @returns No value; the unchanged canonical public validation error is thrown.
 */
export function unsupported(label: string): never {
  throw new AddScaffoldError(
    ADD_FAILURE_CODES.unsupportedSourceShape,
    `Cannot safely edit canonical object in ${label}.`,
  );
}

import { staticPropertyName } from "./source-edit.js";
