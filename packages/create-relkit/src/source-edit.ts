import * as ts from "typescript";

export { addSourceImport } from "./source-import-edit.js";

/**
 * Appends one export declaration after validating the source syntax.
 * @param source - Authored source text inspected or transformed without execution.
 * @param fileName - Source path used for declaration diagnostics.
 * @param declaration - Complete export declaration source.
 * @returns Original source when present, otherwise source with the validated export appended.
 */
export function addSourceExport(source: string, fileName: string, declaration: string): string {
  if (source.includes(declaration)) return source;
  parse(fileName, source);
  return `${source.trimEnd()}\n${declaration}\n`;
}

/**
 * Inserts one property into a canonical factory object or one nested object property.
 * @param source - Authored source text inspected or transformed without execution.
 * @param fileName - Source path used for declaration diagnostics.
 * @param factories - Supported final segments of factory call names.
 * @param path - Nested static property names containing the target member.
 * @param memberName - Static object member name being inserted.
 * @param memberSource - Source of the object member to insert.
 * @returns Source with the member inserted, or unchanged when an identical member already exists.
 */
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

/**
 * Parses the one supported factory object before editing its declarations.
 * @param source - Authored source text inspected or transformed without execution.
 * @param fileName - Source path used for declaration diagnostics.
 * @param factories - Supported final segments of factory call names.
 * @returns The uniquely matched factory's object-literal argument.
 */
export function readFactoryObject(
  source: string,
  fileName: string,
  factories: readonly string[],
): ts.ObjectLiteralExpression {
  return factoryObject(parse(fileName, source), factories);
}

/**
 * Reads one literal string property from a supported factory call.
 * @param source - Authored source text inspected or transformed without execution.
 * @param fileName - Source path used for declaration diagnostics.
 * @param factory - Supported factory call name.
 * @param name - Authored name or declaration key.
 * @param argumentIndex - Zero-based factory argument containing the static options object.
 * @returns The literal string property, or undefined when absent or nonliteral.
 */
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

/**
 * Reads statically known property names without evaluating computed expressions.
 * @param node - Optional property-name AST inspected for a static value.
 * @returns The static identifier/string/number property text, or undefined for computed names.
 */
export function staticPropertyName(node: ts.PropertyName | undefined): string | undefined {
  if (node === undefined) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

import {
  factoryObject,
  descend,
  insertMember,
  assertObject,
  property,
  parse,
  collision,
} from "./source-factory-edit.js";
