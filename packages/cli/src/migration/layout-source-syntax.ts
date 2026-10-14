/** Classifies module and tooling path syntax while preserving comments as untouched bytes. */
import * as ts from "typescript";
import { mentionsMovedRoot } from "./layout-rewrite-paths.js";
import type { MigrationFinding, MigrationMove } from "./layout.types.js";

/**
 * Collects exact literal nodes and unsupported computed imports without evaluation.
 * @param source - Parsed original authored source.
 * @param moves - Selected complete service roots.
 * @returns Module/path tokens and manual-action conflicts.
 */
export function layoutSourceSyntax(source: ts.SourceFile, moves: readonly MigrationMove[]) {
  const file = source.fileName;
  const references: ts.StringLiteralLike[] = [];
  const urls: ts.StringLiteralLike[] = [];
  const tooling: ts.StringLiteralLike[] = [];
  const conflicts: MigrationFinding[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    )
      references.push(node.moduleSpecifier);
    else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    )
      references.push(node.argument.literal);
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) references.push(argument);
      else
        conflicts.push({
          file,
          message: `Computed import at ${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} requires manual verification before migration.`,
        });
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "URL" &&
      isImportMetaUrl(node.arguments?.[1])
    ) {
      const argument = node.arguments?.[0];
      if (argument && ts.isStringLiteralLike(argument)) urls.push(argument);
      else if (moves.length > 0)
        conflicts.push({
          file,
          message: `Computed asset URL at ${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} requires manual verification before migration.`,
        });
    } else if (ts.isTemplateExpression(node) && mentionsMovedRoot(node.getText(source), moves)) {
      conflicts.push({
        file,
        message: `Computed tooling path at ${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}; update it manually before migration.`,
      });
    } else if (ts.isStringLiteralLike(node) && mentionsMovedRoot(node.text, moves))
      tooling.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { references, urls, tooling, conflicts };
}

/** Recognizes the native module URL base without relying on whitespace-sensitive source text.
 * @param node - Parsed second URL constructor argument.
 * @returns Whether the base is exactly import.meta.url. */
function isImportMetaUrl(node: ts.Node | undefined): boolean {
  return (
    node !== undefined &&
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "url" &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.expression.name.text === "meta"
  );
}
