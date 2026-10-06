import * as ts from "typescript";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";

/**
 * Adds or merges one import declaration without reprinting the source file.
 * @param source - Authored source text inspected or transformed without execution.
 * @param fileName - Source path used for declaration diagnostics.
 * @param declaration - Complete import declaration source.
 * @returns Source with the requested import added or merged into its compatible existing declaration.
 */
export function addSourceImport(source: string, fileName: string, declaration: string): string {
  if (source.includes(declaration)) return source;
  const file = parse(fileName, source);
  const wantedFile = parse("import.ts", declaration);
  const wanted = wantedFile.statements.find(ts.isImportDeclaration);
  if (!wanted || !ts.isStringLiteralLike(wanted.moduleSpecifier))
    return append(source, file, declaration);
  const moduleName = wanted.moduleSpecifier.text;
  const existing = file.statements
    .filter(ts.isImportDeclaration)
    .find(
      (item) =>
        ts.isStringLiteralLike(item.moduleSpecifier) && item.moduleSpecifier.text === moduleName,
    );
  const currentBindings = existing?.importClause?.namedBindings;
  const wantedBindings = wanted.importClause?.namedBindings;
  if (
    existing &&
    !existing.importClause?.name &&
    !wanted.importClause?.name &&
    currentBindings &&
    ts.isNamedImports(currentBindings) &&
    wantedBindings &&
    ts.isNamedImports(wantedBindings)
  ) {
    const current = new Set(currentBindings.elements.map((item) => item.getText(file)));
    const missing = wantedBindings.elements
      .map((item) => item.getText(wantedFile))
      .filter((item) => !current.has(item));
    if (missing.length === 0) return source;
    const end = currentBindings.elements.at(-1)?.getEnd() ?? currentBindings.getStart() + 1;
    const separator = currentBindings.elements.length ? ", " : "";
    return `${source.slice(0, end)}${separator}${missing.join(", ")}${source.slice(end)}`;
  }
  return append(source, file, declaration);
}

/**
 * Parses TypeScript for source inspection without executing the application.
 * @param fileName - Source path used in parser diagnostics.
 * @param source - Authored TypeScript source text.
 * @returns The SourceFile AST; parse errors raise the canonical unsupported-source error.
 */
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
  if (diagnostics?.length) {
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.unsupportedSourceShape,
      `Cannot safely edit imports in ${fileName}.`,
    );
  }
  return file;
}

/**
 * Appends a new import after existing import declarations.
 * @param source - Authored source text inspected or transformed without execution.
 * @param file - TypeScript SourceFile AST whose imports are inspected.
 * @param declaration - Complete import declaration source.
 * @returns Source with the import inserted after existing imports or before the first statement.
 */
function append(source: string, file: ts.SourceFile, declaration: string): string {
  const imports = file.statements.filter(ts.isImportDeclaration);
  const offset = imports.at(-1)?.getEnd() ?? 0;
  return offset === 0
    ? `${declaration}\n${source}`
    : `${source.slice(0, offset)}\n${declaration}${source.slice(offset)}`;
}
