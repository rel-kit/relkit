/**
 * Byte-preserving text edits for codemod rules. Rules collect replacements at node positions
 * and apply them in one pass, so text a rule does not touch (comments, formatting, quotes)
 * keeps its exact bytes. Overlapping edits are a rule bug and throw instead of corrupting text.
 */
import { codeSyntax as ts, type CodeSource } from "./code-parser.js";
import type { CodeFinding } from "./code-migration.types.js";

/** Replace `[start, end)` of the original text with `text`. */
export interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * Applies non-overlapping edits against the original text.
 * @param text - Original file text.
 * @param edits - Replacements in original-text offsets, in any order.
 * @returns The edited text, or the original when there are no edits.
 * @throws Error When two edits overlap, which means a rule produced conflicting changes.
 */
export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((left, right) => left.start - right.start || left.end - right.end);
  let output = "";
  let cursor = 0;
  for (const edit of sorted) {
    if (edit.start < cursor) throw new Error("Codemod edits overlap.");
    output += text.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return output + text.slice(cursor);
}

/**
 * Builds an edit that replaces one node's own text, keeping its leading trivia.
 * @param source - Parsed file the node belongs to.
 * @param node - Node to replace.
 * @param text - Replacement text.
 * @returns The edit covering the node without its leading comments and whitespace.
 */
export function replaceNode(source: CodeSource, node: ts.Node, text: string): TextEdit {
  return { start: node.getStart(source), end: node.getEnd(), text };
}

/**
 * Locates a node for a finding.
 * @param source - Parsed file.
 * @param node - Node the finding is about.
 * @param rule - Rule ID reporting it.
 * @param message - What the developer has to change by hand.
 * @param file - Path to report; markdown blocks pass the document path.
 * @param lineOffset - Lines before the parsed text inside the reported file.
 * @returns A finding with a 1-based line.
 */
export function findingAt(
  source: CodeSource,
  node: ts.Node,
  rule: string,
  message: string,
  file = source.fileName,
  lineOffset = 0,
): CodeFinding {
  const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 + lineOffset;
  return { file, line, rule, message };
}

/**
 * Visits every node depth-first.
 * @param node - Root node.
 * @param visit - Callback for each node, parents before children.
 * @returns Nothing.
 */
export function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/**
 * Reads the string value of a string-literal-like node.
 * @param node - Any expression.
 * @returns The literal text, or undefined for non-literals.
 */
export function literalText(node: ts.Node | undefined): string | undefined {
  return node !== undefined && ts.isStringLiteralLike(node) ? node.text : undefined;
}

/**
 * Finds a property assignment by name in an object literal.
 * @param object - Object literal to search.
 * @param name - Property name.
 * @returns The property node, if present (assignment or shorthand).
 */
export function objectProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | ts.ShorthandPropertyAssignment | undefined {
  for (const property of object.properties)
    if (
      (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
      propertyName(property.name) === name
    )
      return property;
  return undefined;
}

/**
 * Reads a static property name.
 * @param name - Property name node.
 * @returns The name text for identifiers and string literals, otherwise undefined.
 */
export function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  return undefined;
}

/**
 * Builds an edit that removes one property and its trailing comma.
 * @param source - Parsed file.
 * @param property - Property to remove.
 * @returns The removal edit, including the property's own line when it stands alone.
 */
export function removeProperty(source: CodeSource, property: ts.ObjectLiteralElement): TextEdit {
  const text = source.getFullText();
  let start = property.getStart(source);
  let end = property.getEnd();
  if (text[end] === ",") end += 1;
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", end);
  const alone =
    text.slice(lineStart, start).trim() === "" &&
    (lineEnd === -1 ? text.slice(end) : text.slice(end, lineEnd)).trim() === "";
  if (alone) {
    start = lineStart;
    end = lineEnd === -1 ? text.length : lineEnd + 1;
  } else while (text[end] === " ") end += 1;
  return { start, end, text: "" };
}

/**
 * Reads the indentation of the line a node starts on.
 * @param source - Parsed file.
 * @param node - Node whose line is measured.
 * @returns The leading whitespace of that line.
 */
export function indentOf(source: CodeSource, node: ts.Node): string {
  const text = source.getFullText();
  const start = node.getStart(source);
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? "";
}

/**
 * Inserts a property before the first one, matching single- or multi-line layout.
 * @param source - Parsed file.
 * @param object - Options object.
 * @param property - Property text without a trailing comma.
 * @returns The insertion edit.
 */
export function insertFirst(
  source: CodeSource,
  object: ts.ObjectLiteralExpression,
  property: string,
): TextEdit {
  const first = object.properties[0];
  if (first === undefined)
    return { start: object.getStart(source), end: object.getEnd(), text: `{ ${property} }` };
  const start = first.getStart(source);
  const multiline =
    source.getLineAndCharacterOfPosition(object.getStart(source)).line !==
    source.getLineAndCharacterOfPosition(start).line;
  return {
    start,
    end: start,
    text: multiline ? `${property},\n${indentOf(source, first)}` : `${property}, `,
  };
}
