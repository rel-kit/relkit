/**
 * Collects source dependency edges through static imports, re-exports, type-only
 * imports and dynamic import expressions. Computed dynamic targets remain explicit
 * analysis limits; nothing in this syntax walk evaluates application code.
 */
import * as ts from "typescript";
import type { SourceModuleReference } from "./source-resolution.types.js";

/**
 * Retains dependency literal offsets and every unsupported dynamic target.
 * @param source - Parsed authored module whose real filename supplies provenance.
 * @returns Source-ordered references; absent specifiers denote computed imports.
 */
export function sourceModuleReferences(source: ts.SourceFile): readonly SourceModuleReference[] {
  const result: SourceModuleReference[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      result.push({
        specifier: node.moduleSpecifier.text,
        position: node.moduleSpecifier.getStart(source),
        dynamic: false,
      });
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      result.push({
        specifier: node.argument.literal.text,
        position: node.argument.literal.getStart(source),
        dynamic: false,
      });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      result.push({
        ...(argument && ts.isStringLiteralLike(argument) ? { specifier: argument.text } : {}),
        position: node.getStart(source),
        dynamic: true,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}
