/** Retains preprocessor imports and namespace reexports that TypeScript's preprocessor omits. */
import ts from "typescript";

/**
 * Collects exact source module literals without inferring computed import targets.
 * @param source - The actual observed runtime or declaration source.
 * @returns Existing preprocessor imports plus AST namespace-export specifiers.
 */
export function consumerModuleImports(source: ts.SourceFile): readonly string[] {
  const imports = new Set(
    ts.preProcessFile(source.text, true, true).importedFiles.map((item) => item.fileName),
  );
  for (const statement of source.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamespaceExport(statement.exportClause) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    )
      imports.add(statement.moduleSpecifier.text);
  }
  return [...imports];
}
