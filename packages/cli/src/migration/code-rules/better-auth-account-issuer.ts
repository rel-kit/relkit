/**
 * Rule `better-auth-account-issuer`: Better Auth 1.7.0 through 1.7.2 required an `issuer` column on
 * the `account` table and a unique index on `issuer` and `accountId`; from 1.7.3 Better Auth never
 * writes the column and, from its startup schema check, rejects a required column it never writes.
 * In a Drizzle table declared with `sqliteTable`, `pgTable` or `mysqlTable` for `"account"`, the
 * rule removes the `issuer` column and every index entry that reads `table.issuer`, drops the
 * extra-config callback when nothing is left in it, and removes index helper imports that are no
 * longer used. It reports the table so the developer generates and applies the database migration.
 */
import { codeSyntax as ts, parseCodeSource, type CodeSource } from "../code-parser.js";
import {
  applyTextEdits,
  findingAt,
  literalText,
  objectProperty,
  removeProperty,
  walk,
  type TextEdit,
} from "../code-edits.js";
import { bindingReferences, namedImports, type NamedImport } from "../code-imports.js";
import type { CodeFinding, CodeRule } from "../code-migration.types.js";

const id = "better-auth-account-issuer";
const coreModule = /^drizzle-orm\/(?:sqlite|pg|mysql)-core$/;
const tableBuilders = new Set(["sqliteTable", "pgTable", "mysqlTable"]);
const migrateStep =
  "Removed account.issuer, which Better Auth 1.7.3 and later never write. Generate and apply the database migration: run db:generate, review the SQL, then db:migrate.";
const manualStep =
  "Better Auth 1.7.3 and later never write account.issuer, and this table's index callback is not a plain list of entries: remove the issuer column and the index entries that read it by hand, then run db:generate and db:migrate.";

export const betterAuthAccountIssuerRule: CodeRule = {
  id,
  summary: "Remove the Better Auth account issuer column",
  guide: "better-auth-account-issuer",
  appliesTo: (path) => /\.[cm]?[jt]s$/.test(path) && !path.endsWith(".d.ts"),
  apply: (file) => {
    if (!file.text.includes("issuer")) return { text: file.text, findings: [] };
    const source = parseCodeSource(file.path, file.text);
    const imports = namedImports(source, (module) => coreModule.test(module));
    const builders = new Set(
      imports.filter((entry) => tableBuilders.has(entry.imported)).map((entry) => entry.local),
    );
    const edits: TextEdit[] = [];
    const removed: ts.Node[] = [];
    const findings: CodeFinding[] = [];
    for (const call of accountTables(source, builders)) {
      const columns = call.arguments[1];
      if (columns === undefined || !ts.isObjectLiteralExpression(columns)) continue;
      const issuer = objectProperty(columns, "issuer");
      if (issuer === undefined) continue;
      const extra = call.arguments[2];
      const entries = extra === undefined || !readsIssuer(extra) ? [] : indexEntries(extra);
      if (entries === undefined) {
        findings.push(findingAt(source, issuer, id, manualStep));
        continue;
      }
      const dropped = entries.filter(readsIssuer);
      removed.push(...dropped);
      edits.push(removeProperty(source, issuer));
      if (extra !== undefined && dropped.length > 0 && dropped.length === entries.length)
        edits.push({ start: columns.getEnd(), end: extra.getEnd(), text: "" });
      else edits.push(...dropped.map((entry) => removeElement(source, entry)));
      findings.push(findingAt(source, call, id, migrateStep));
    }
    edits.push(...unusedImports(source, imports, removed));
    return { text: applyTextEdits(file.text, edits), findings };
  },
};

/**
 * Finds `builder("account", { ... })` calls of the Drizzle table builders the file imports.
 * @param source - Parsed file.
 * @param builders - Local names of `sqliteTable`, `pgTable` and `mysqlTable`.
 * @returns The table calls declaring Better Auth's default `account` table.
 */
function accountTables(source: CodeSource, builders: ReadonlySet<string>): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  if (builders.size === 0) return found;
  walk(source, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      builders.has(node.expression.text) &&
      literalText(node.arguments[0]) === "account"
    )
      found.push(node);
  });
  return found;
}

/**
 * Tells whether a node reads a property named `issuer`, as `table.issuer` does.
 * @param node - Expression to search.
 * @returns True when any property access inside it names `issuer`.
 */
function readsIssuer(node: ts.Node): boolean {
  let found = false;
  walk(node, (child) => {
    if (ts.isPropertyAccessExpression(child) && child.name.text === "issuer") found = true;
  });
  return found;
}

/**
 * Reads the index entries of `(table) => [ ... ]`, also with parentheses or `{ return [ ... ]; }`.
 * @param extra - Third argument of the table builder.
 * @returns The array's elements, or undefined for any other shape.
 */
function indexEntries(extra: ts.Expression): readonly ts.Expression[] | undefined {
  if (!ts.isArrowFunction(extra) && !ts.isFunctionExpression(extra)) return undefined;
  let body: ts.Node = extra.body;
  if (ts.isBlock(body)) {
    const statement = body.statements.length === 1 ? body.statements[0] : undefined;
    if (statement === undefined || !ts.isReturnStatement(statement) || !statement.expression)
      return undefined;
    body = statement.expression;
  }
  while (ts.isParenthesizedExpression(body)) body = body.expression;
  return ts.isArrayLiteralExpression(body) ? body.elements : undefined;
}

/**
 * Removes one array element and the comma that separates it from its neighbour.
 * @param source - Parsed file.
 * @param element - Element to remove.
 * @returns The removal edit, taking the element's own line when it stands alone.
 */
function removeElement(source: CodeSource, element: ts.Expression): TextEdit {
  const text = source.getFullText();
  const start = element.getStart(source);
  let end = element.getEnd();
  while (text[end] === " ") end += 1;
  if (text[end] === ",") end += 1;
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", end);
  const rest = lineEnd === -1 ? text.slice(end) : text.slice(end, lineEnd);
  if (text.slice(lineStart, start).trim() === "" && rest.trim() === "")
    return { start: lineStart, end: lineEnd === -1 ? text.length : lineEnd + 1, text: "" };
  while (text[end] === " ") end += 1;
  return { start, end, text: "" };
}

/**
 * Drops Drizzle core imports whose every reference lies in a removed index entry.
 * @param source - Parsed file.
 * @param imports - Named imports of the Drizzle core modules.
 * @param removed - Index entries the rule removes.
 * @returns One edit per import declaration that loses a specifier.
 */
function unusedImports(
  source: CodeSource,
  imports: readonly NamedImport[],
  removed: readonly ts.Node[],
): TextEdit[] {
  if (removed.length === 0) return [];
  const inside = (node: ts.Node) =>
    removed.some(
      (entry) => node.getStart(source) >= entry.getStart(source) && node.getEnd() <= entry.getEnd(),
    );
  const unused = imports.filter((entry) => {
    const references = bindingReferences(source, entry.local);
    return references.length > 0 && references.every(inside);
  });
  const edits: TextEdit[] = [];
  for (const declaration of new Set(unused.map((entry) => entry.declaration))) {
    const bindings = declaration.importClause!.namedBindings as ts.NamedImports;
    const kept = bindings.elements.filter(
      (specifier) => !unused.some((entry) => entry.specifier === specifier),
    );
    if (kept.length === 0 && declaration.importClause!.name === undefined) {
      const end = declaration.getEnd();
      edits.push({
        start: declaration.getStart(source),
        end: source.getFullText()[end] === "\n" ? end + 1 : end,
        text: "",
      });
    } else
      edits.push({
        start: bindings.getStart(source),
        end: bindings.getEnd(),
        text: `{ ${kept.map((specifier) => specifier.getText(source)).join(", ")} }`,
      });
  }
  return edits;
}
