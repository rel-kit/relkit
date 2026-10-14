/** Projects only owned commerce fixture paths, preserving every native descriptor and non-module source byte. */
import { dirname, relative, resolve } from "node:path";
import * as ts from "typescript";

/**
 * Removes the evidenced grouping container from an owned application path.
 * @param path - Fixture-relative application or test path.
 * @returns Its equivalent flat compatibility path.
 */
export function flatCommercePath(path: string): string {
  return path.replace("examples/commerce/src/services/", "examples/commerce/src/");
}

/**
 * Preserves resolved native module targets through a whole-service move.
 * @param text - Complete original authored fixture source.
 * @param before - Original fixture-relative importer path.
 * @returns Source with only import/export/literal-dynamic module paths projected.
 */
export function flatCommerceImports(text: string, before: string): string {
  const source = ts.createSourceFile(before, text, ts.ScriptTarget.Latest, true);
  const edits: ts.TextChange[] = [];
  const visit = (node: ts.Node): void => {
    const module = moduleLiteral(node);
    if (module) {
      const path = flatModule(module.text, before);
      if (path !== module.text)
        edits.push({
          span: {
            start: module.getStart(source),
            length: module.getWidth(source),
          },
          newText: JSON.stringify(path),
        });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const edit of edits.reverse())
    text =
      text.slice(0, edit.span.start) +
      edit.newText +
      text.slice(edit.span.start + edit.span.length);
  return text;
}

/**
 * Selects only syntactic module references, leaving comments and unrelated strings intact.
 * @param node - Native TypeScript syntax node.
 * @returns A literal module operand when the syntax proves it is an import or export.
 */
function moduleLiteral(node: ts.Node): ts.StringLiteral | undefined {
  let operand: ts.Node | undefined;
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) operand = node.moduleSpecifier;
  else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
    operand = node.arguments[0];
  return operand && ts.isStringLiteral(operand) ? operand : undefined;
}

/**
 * Resolves relative paths before projection instead of guessing from importer depth.
 * @param module - Original module specifier.
 * @param before - Original fixture-relative importer.
 * @returns The same native module target from the projected importer.
 */
function flatModule(module: string, before: string): string {
  if (module.startsWith("@app/services/")) return module.replace("@app/services/", "@app/");
  if (!module.startsWith(".")) return module;
  const target = relative("/fixture", resolve("/fixture", dirname(before), module));
  let path = relative(dirname(flatCommercePath(before)), flatCommercePath(target)).replaceAll(
    "\\",
    "/",
  );
  if (!path.startsWith(".")) path = "./" + path;
  return path;
}
