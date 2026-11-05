/**
 * Rule `package-imports`: rewrites module specifiers of the merged 0.8 packages to `relkit`,
 * `relkit/<area>` and the tool packages, in import and export declarations, `import()` calls
 * and `import("…")` types. Names imported from the `@relkit/app` root that the curated
 * `relkit` root no longer exports stay on `@relkit/app` and are reported, because their
 * subpath depends on the name. `package.json` files are handled by `package-manifest.ts`.
 */
import { codeSyntax as ts, parseCodeSource } from "../code-parser.js";
import { applyTextEdits, findingAt, walk, type TextEdit } from "../code-edits.js";
import type { CodeFile, CodeFinding, CodeRule, CodeRuleContext } from "../code-migration.types.js";
import { exportKey, packageTarget } from "./package-map.js";
import { rewriteManifest } from "./package-manifest.js";

const id = "package-imports";

export const packageImportsRule: CodeRule = {
  id,
  summary: "Import relkit and the merged @relkit packages instead of @relkit/app",
  guide: "packages-and-imports",
  markdown: true,
  appliesTo: (path) => /\.[cm]?[jt]sx?$/.test(path) || /(^|\/)package\.json$/.test(path),
  apply: (file, context) =>
    file.path.endsWith("package.json")
      ? rewriteManifest(file, context, id)
      : rewriteSpecifiers(file, context),
};

/**
 * Rewrites every literal module specifier in one module.
 * @param file - Module to rewrite.
 * @param context - Root export names and the 0.9 export maps.
 * @returns New text and findings for removed packages and names outside the root.
 */
function rewriteSpecifiers(file: CodeFile, context: CodeRuleContext) {
  const source = parseCodeSource(file.path, file.text);
  const edits: TextEdit[] = [];
  const findings: CodeFinding[] = [];
  walk(source, (node) => {
    const literal = moduleLiteral(node);
    if (literal === undefined) return;
    const target = packageTarget(literal.text);
    if (target === undefined) return;
    if (target.kind === "removed") {
      findings.push(findingAt(source, literal, id, target.reason));
      return;
    }
    if (!exported(target.specifier, context)) {
      findings.push(
        findingAt(source, literal, id, `${literal.text} has no 0.9 export ${target.specifier}.`),
      );
      return;
    }
    if (literal.text === "@relkit/app" && !rootOnly(node, context, findings, source)) return;
    edits.push({
      start: literal.getStart(source) + 1,
      end: literal.getEnd() - 1,
      text: target.specifier,
    });
  });
  return { text: applyTextEdits(file.text, edits), findings };
}

/**
 * Finds the module-specifier literal a node carries, if any.
 * @param node - Any node.
 * @returns The specifier literal of an import, export, `import()` call or import type.
 */
function moduleLiteral(node: ts.Node): ts.StringLiteralLike | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  )
    return node.moduleSpecifier;
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments[0] !== undefined &&
    ts.isStringLiteralLike(node.arguments[0])
  )
    return node.arguments[0];
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteralLike(node.argument.literal)
  )
    return node.argument.literal;
  return undefined;
}

/**
 * Checks a target against the 0.9 export maps when they are known.
 * @param specifier - New module specifier.
 * @param context - Rule context with optional export maps.
 * @returns Whether the target is exported, or true when the maps are unavailable.
 */
function exported(specifier: string, context: CodeRuleContext): boolean {
  const { packageName, key } = exportKey(specifier);
  const keys = context.packageExports?.get(packageName);
  return keys === undefined || keys.has(key);
}

/**
 * Decides whether an `@relkit/app` root import can move to the `relkit` root, reporting the
 * names that cannot.
 * @param node - Import, export or dynamic-import node.
 * @param context - Root export names.
 * @param findings - Collector for names outside the curated root.
 * @param source - Parsed file, for locations.
 * @returns Whether every imported name is in the `relkit` root.
 */
function rootOnly(
  node: ts.Node,
  context: CodeRuleContext,
  findings: CodeFinding[],
  source: ts.SourceFile,
): boolean {
  const names = rootNames(node);
  if (names === undefined) {
    findings.push(
      findingAt(source, node, id, "Import named exports from relkit instead of the whole module."),
    );
    return false;
  }
  const outside = names.filter((name) => !context.rootExports.has(name));
  for (const name of outside)
    findings.push(
      findingAt(
        source,
        node,
        id,
        `${name} is not exported from the relkit root; import it from its relkit/<area> subpath.`,
      ),
    );
  return outside.length === 0;
}

/**
 * Lists the exported names an import or re-export reads from its module.
 * @param node - Import or export declaration.
 * @returns The names, or undefined for namespace, star and dynamic imports.
 */
function rootNames(node: ts.Node): string[] | undefined {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (clause === undefined || clause.name !== undefined) return undefined;
    const bindings = clause.namedBindings;
    if (bindings === undefined) return [];
    if (!ts.isNamedImports(bindings)) return undefined;
    return bindings.elements.map((element) => (element.propertyName ?? element.name).text);
  }
  if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause))
    return node.exportClause.elements.map((element) => (element.propertyName ?? element.name).text);
  return undefined;
}
