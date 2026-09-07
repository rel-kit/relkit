import * as ts from "typescript";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
export { addSourceImport } from "./source-import-edit.js";

/** Appends one export declaration after validating the source syntax. */
export function addSourceExport(source: string, fileName: string, declaration: string): string {
  if (source.includes(declaration)) return source;
  parse(fileName, source);
  return `${source.trimEnd()}\n${declaration}\n`;
}

/** Inserts one property into a canonical factory object or one nested object property. */
export function addFactoryObjectMember(
  source: string,
  fileName: string,
  factories: readonly string[],
  path: readonly string[],
  memberName: string,
  memberSource: string,
): string {
  const file = parse(fileName, source);
  const root = factoryObject(file, factories);
  const target = descend(root, path, source, memberSource);
  assertObject(target.object, source);
  const existing = !target.created ? property(target.object, memberName) : undefined;
  if (existing !== undefined) {
    const current = source.slice(existing.getStart(), existing.getEnd()).replace(/\s+/g, " ");
    if (current === memberSource.replace(/\s+/g, " ")) return source;
    collision(fileName, [...path, memberName]);
  }
  const insertion = target.created ? `${target.name}: { ${memberSource} }` : memberSource;
  return insertMember(source, target.parent ?? target.object, insertion);
}

export function readFactoryObject(
  source: string,
  fileName: string,
  factories: readonly string[],
): ts.ObjectLiteralExpression {
  return factoryObject(parse(fileName, source), factories);
}

export function readFactoryStringProperty(
  source: string,
  fileName: string,
  factory: string,
  name: string,
  argumentIndex = 0,
): string | undefined {
  const object = factoryObject(parse(fileName, source), [factory], argumentIndex);
  const item = property(object, name);
  return item && ts.isPropertyAssignment(item) && ts.isStringLiteralLike(item.initializer)
    ? item.initializer.text
    : undefined;
}

export function staticPropertyName(node: ts.PropertyName | undefined): string | undefined {
  if (node === undefined) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function factoryObject(
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

function descend(
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

function insertMember(source: string, object: ts.ObjectLiteralExpression, member: string): string {
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

function assertObject(object: ts.ObjectLiteralExpression, source: string): void {
  for (const item of object.properties) {
    if (ts.isSpreadAssignment(item) || staticPropertyName(item.name) === undefined) {
      unsupported(source.slice(item.getStart(), item.getEnd()));
    }
  }
}

function property(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.ObjectLiteralElementLike | undefined {
  return object.properties.find((item) => staticPropertyName(item.name) === name);
}

function parse(fileName: string, source: string): ts.SourceFile {
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

function unwrap(value: ts.Expression | undefined): ts.Expression | undefined {
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

function lastSegment(expression: ts.Expression): string {
  return ts.isIdentifier(expression)
    ? expression.text
    : ts.isPropertyAccessExpression(expression)
      ? expression.name.text
      : "";
}

function collision(fileName: string, path: readonly string[]): never {
  throw new AddScaffoldError(
    ADD_FAILURE_CODES.collision,
    `${fileName} already declares ${path.join(".")}.`,
  );
}

function unsupported(label: string): never {
  throw new AddScaffoldError(
    ADD_FAILURE_CODES.unsupportedSourceShape,
    `Cannot safely edit canonical object in ${label}.`,
  );
}
