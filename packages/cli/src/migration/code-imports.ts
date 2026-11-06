/**
 * Import-declaration helpers for codemod rules: find which local names a module provides,
 * add a named import next to the existing imports, and rename or drop one specifier. All
 * helpers return text edits against the original source, so they compose with a rule's other
 * edits in one `applyTextEdits` pass.
 */
import { codeSyntax as ts, type CodeSource } from "./code-parser.js";
import { literalText, type TextEdit } from "./code-edits.js";

/** A named import: the exported name, the local binding and the declaration holding it. */
export interface NamedImport {
  readonly imported: string;
  readonly local: string;
  readonly specifier: ts.ImportSpecifier;
  readonly declaration: ts.ImportDeclaration;
}

/**
 * Lists named imports whose module specifier matches.
 * @param source - Parsed file.
 * @param matches - Predicate over the module specifier text.
 * @returns Every named import from matching modules, in source order.
 */
export function namedImports(source: CodeSource, matches: (module: string) => boolean) {
  const found: NamedImport[] = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const module = literalText(statement.moduleSpecifier);
    const bindings = statement.importClause?.namedBindings;
    if (module === undefined || !matches(module) || !bindings || !ts.isNamedImports(bindings))
      continue;
    for (const specifier of bindings.elements)
      found.push({
        imported: (specifier.propertyName ?? specifier.name).text,
        local: specifier.name.text,
        specifier,
        declaration: statement,
      });
  }
  return found;
}

/**
 * Finds the local name a module's export is bound to.
 * @param source - Parsed file.
 * @param modules - Accepted module specifiers.
 * @param name - Exported name.
 * @returns The local binding, or undefined when the file does not import it.
 */
export function importedLocal(source: CodeSource, modules: readonly string[], name: string) {
  return namedImports(source, (module) => modules.includes(module)).find(
    (entry) => entry.imported === name,
  )?.local;
}

/**
 * Adds `import { name } from module`, merging into an existing named import of that module.
 * @param source - Parsed file.
 * @param module - Module specifier.
 * @param name - Exported name to import.
 * @param typeOnly - Whether a new declaration should be `import type`.
 * @returns The edit, or undefined when the name is already imported.
 */
export function addNamedImport(
  source: CodeSource,
  module: string,
  name: string,
  typeOnly = false,
): TextEdit | undefined {
  const existing = namedImports(source, (value) => value === module);
  if (existing.some((entry) => entry.imported === name && entry.local === name)) return undefined;
  const target = existing.find((entry) => !entry.declaration.importClause?.isTypeOnly);
  if (target !== undefined && !typeOnly) {
    const bindings = target.declaration.importClause!.namedBindings as ts.NamedImports;
    const last = bindings.elements[bindings.elements.length - 1]!;
    return { start: last.getEnd(), end: last.getEnd(), text: `, ${name}` };
  }
  const line = `import ${typeOnly ? "type " : ""}{ ${name} } from "${module}";\n`;
  return { ...importInsertion(source), text: line };
}

/**
 * Adds a default import line after the existing imports.
 * @param source - Parsed file.
 * @param module - Module specifier.
 * @param local - Local binding name.
 * @returns The insertion edit.
 */
export function addDefaultImport(source: CodeSource, module: string, local: string): TextEdit {
  return { ...importInsertion(source), text: `import ${local} from "${module}";\n` };
}

/**
 * Picks the offset where a new import line goes: after the last import, else at the top
 * after a leading file comment.
 * @param source - Parsed file.
 * @returns A zero-width range.
 */
function importInsertion(source: CodeSource): { start: number; end: number } {
  const imports = source.statements.filter(ts.isImportDeclaration);
  const last = imports[imports.length - 1];
  if (last !== undefined) {
    const end = source.getFullText().indexOf("\n", last.getEnd());
    const offset = end === -1 ? source.getFullText().length : end + 1;
    return { start: offset, end: offset };
  }
  const first = source.statements[0];
  const offset = first === undefined ? 0 : first.getStart(source);
  return { start: offset, end: offset };
}

/**
 * Removes one named specifier, or the whole declaration when it is the only binding.
 * @param source - Parsed file.
 * @param entry - The named import to drop.
 * @returns The removal edit.
 */
export function removeNamedImport(source: CodeSource, entry: NamedImport): TextEdit {
  const clause = entry.declaration.importClause!;
  const bindings = clause.namedBindings as ts.NamedImports;
  if (bindings.elements.length === 1 && clause.name === undefined) {
    const text = source.getFullText();
    const start = entry.declaration.getStart(source);
    let end = entry.declaration.getEnd();
    if (text[end] === "\n") end += 1;
    return { start, end, text: "" };
  }
  const index = bindings.elements.indexOf(entry.specifier);
  const next = bindings.elements[index + 1];
  if (next !== undefined)
    return { start: entry.specifier.getStart(source), end: next.getStart(source), text: "" };
  const previous = bindings.elements[index - 1]!;
  return { start: previous.getEnd(), end: entry.specifier.getEnd(), text: "" };
}

/**
 * Collects identifier references to a local binding, excluding declarations and property names.
 * @param source - Parsed file.
 * @param local - Binding name.
 * @returns Identifier nodes that read the binding.
 */
export function bindingReferences(source: CodeSource, local: string): ts.Identifier[] {
  const found: ts.Identifier[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === local && isReference(node)) found.push(node);
    node.forEachChild(visit);
  };
  visit(source);
  return found;
}

/**
 * Renames every reference to a local binding, keeping shorthand properties' keys.
 * @param source - Parsed file.
 * @param from - Current binding name.
 * @param to - New binding name.
 * @returns One edit per reference; `{ from }` becomes `{ from: to }`.
 */
export function renameReferences(source: CodeSource, from: string, to: string): TextEdit[] {
  return bindingReferences(source, from).map((node) => ({
    start: node.getStart(source),
    end: node.getEnd(),
    text: ts.isShorthandPropertyAssignment(node.parent) ? `${from}: ${to}` : to,
  }));
}

/**
 * Tells whether an identifier reads a value rather than naming a property or declaration.
 * @param node - Identifier to classify.
 * @returns Whether renaming the binding should rename this identifier.
 */
function isReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isQualifiedName(parent) && parent.right === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
  if (ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) return parent.name !== node;
  if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
  return true;
}
