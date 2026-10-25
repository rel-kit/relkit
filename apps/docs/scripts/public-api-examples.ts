/** Finds maintained repository examples through their imported declaration identities, including aliases. */
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";

/** Links a symbol without an inline example to a source example or test that imports and uses it.
 * @param root - Repository root. @param program - Existing export-audit compiler program.
 * @returns Declaration identity to source/line links; absent symbols retain their module examples. */
export function repositoryExamples(root: string, program: ts.Program): Map<string, string> {
  const examples = new Map<string, string>();
  const patterns = [
    "apps/docs/examples/**/*.{ts,tsx}",
    "examples/**/src/**/*.{ts,tsx}",
    "templates/**/src/**/*.{ts,tsx}",
    "packages/*/tests/**/*.{ts,tsx}",
    "integrations/packages/*/tests/**/*.{ts,tsx}",
    "tests/**/*.{ts,tsx}",
  ];
  for (const pattern of patterns)
    for (const path of [...new Bun.Glob(pattern).scanSync({ cwd: root })].sort()) {
      if (path.includes("/node_modules/") || path.includes("/.relkit/")) continue;
      const file = ts.createSourceFile(
        resolve(root, path),
        readFileSync(resolve(root, path), "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const bindings = importedExamples(root, program, file);
      const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node)) return;
        if (ts.isIdentifier(node)) {
          const identity = bindings.get(node.text);
          if (identity && !examples.has(identity))
            examples.set(
              identity,
              `${path}#L${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
            );
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
  return examples;
}

/** Resolves explicit named imports to the compiler's canonical declaration, avoiding same-name package collisions.
 * @param root - Repository root. @param program - Export-audit program. @param file - Example AST.
 * @returns Local imported name to original source/name identity. */
function importedExamples(
  root: string,
  program: ts.Program,
  file: ts.SourceFile,
): Map<string, string> {
  const bindings = new Map<string, string>();
  const checker = program.getTypeChecker();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const imported = statement.importClause?.namedBindings;
    if (!imported || !ts.isNamedImports(imported)) continue;
    const resolved = ts.resolveModuleName(
      statement.moduleSpecifier.text,
      file.fileName,
      program.getCompilerOptions(),
      ts.sys,
    ).resolvedModule;
    const target = resolved && program.getSourceFile(resolved.resolvedFileName);
    const module = target && checker.getSymbolAtLocation(target);
    if (!module) continue;
    const exports = checker.getExportsOfModule(module);
    for (const item of imported.elements) {
      const symbol = exports.find(({ name }) => name === (item.propertyName ?? item.name).text);
      if (!symbol) continue;
      const original =
        symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const declaration = original.getDeclarations()?.[0];
      if (declaration)
        bindings.set(
          item.name.text,
          `${relative(root, declaration.getSourceFile().fileName)}:${original.name}`,
        );
    }
  }
  return bindings;
}
