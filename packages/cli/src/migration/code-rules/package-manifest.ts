/**
 * The `package-imports` rule for `package.json`: drops dependencies on `@relkit/app` and the
 * merged packages and makes sure their owners (`relkit`, `@relkit/cli`, `@relkit/inspector`,
 * `@relkit/pulumi`) are present. Workspace, catalog, link and file ranges keep their protocol;
 * version ranges keep their operator with the release version. Text edits keep the file's
 * formatting and key order.
 */
import { codeSyntax as ts } from "../code-parser.js";
import { applyTextEdits, findingAt, type TextEdit } from "../code-edits.js";
import type { CodeFile, CodeFinding, CodeRuleContext } from "../code-migration.types.js";
import { packageTarget } from "./package-map.js";

const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

/**
 * Rewrites one manifest's dependency sections.
 * @param file - The `package.json` file.
 * @param context - Release version for added dependencies.
 * @param rule - Rule ID for findings.
 * @returns New text and findings for removed packages.
 */
export function rewriteManifest(file: CodeFile, context: CodeRuleContext, rule: string) {
  const source = ts.parseJsonText(file.path, file.text);
  const root = source.statements[0]?.expression;
  const findings: CodeFinding[] = [];
  if (root === undefined || !ts.isObjectLiteralExpression(root))
    return { text: file.text, findings };
  const present = new Set<string>();
  const sectionNodes = new Map<string, ts.ObjectLiteralExpression>();
  for (const section of sections) {
    const node = sectionObject(root, section);
    if (node === undefined) continue;
    sectionNodes.set(section, node);
    for (const entry of entries(node)) present.add(entry.name);
  }
  const edits: TextEdit[] = [];
  for (const node of sectionNodes.values()) {
    const kept: string[] = [];
    let changed = false;
    for (const entry of entries(node)) {
      const target = packageTarget(entry.name);
      if (target?.kind === "removed")
        findings.push(findingAt(source, entry.node, rule, target.reason));
      if (target?.kind !== "moved") {
        kept.push(entry.node.getText(source));
        continue;
      }
      changed = true;
      if (present.has(target.packageName)) continue;
      present.add(target.packageName);
      kept.push(`"${target.packageName}": "${releaseRange(entry.range, context.version)}"`);
    }
    if (changed) edits.push(rewriteSection(source, node, kept));
  }
  return { text: applyTextEdits(file.text, edits), findings };
}

/**
 * Reads one dependency section object.
 * @param root - Manifest object.
 * @param section - Section key.
 * @returns The object literal, if present.
 */
function sectionObject(root: ts.ObjectLiteralExpression, section: string) {
  for (const property of root.properties)
    if (
      ts.isPropertyAssignment(property) &&
      ts.isStringLiteral(property.name) &&
      property.name.text === section &&
      ts.isObjectLiteralExpression(property.initializer)
    )
      return property.initializer;
  return undefined;
}

/**
 * Lists `name: range` entries of a section.
 * @param section - Section object.
 * @returns Each entry's name, range and node.
 */
function entries(section: ts.ObjectLiteralExpression) {
  return section.properties.flatMap((node) =>
    ts.isPropertyAssignment(node) &&
    ts.isStringLiteral(node.name) &&
    ts.isStringLiteral(node.initializer)
      ? [{ name: node.name.text, range: node.initializer.text, node }]
      : [],
  );
}

/**
 * Chooses the range for a package that replaces a merged one.
 * @param previous - Range the removed dependency used.
 * @param version - Release version.
 * @returns A workspace-style range unchanged, else the previous operator with the version.
 */
function releaseRange(previous: string, version: string): string {
  if (/^(?:workspace|catalog|link|file|portal):/.test(previous)) return previous;
  const operator = /^[\^~]|^>=/.exec(previous)?.[0] ?? "";
  return `${operator}${version}`;
}

/**
 * Replaces a section object with the given entries, one per line at its indentation.
 * @param source - Parsed manifest.
 * @param section - Section object to replace.
 * @param kept - Entry texts in order.
 * @returns The replacement edit; JSON has no comments to preserve inside it.
 */
function rewriteSection(
  source: ts.JsonSourceFile,
  section: ts.ObjectLiteralExpression,
  kept: readonly string[],
): TextEdit {
  const text = source.getFullText();
  const start = section.getStart(source);
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const outer = /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? "";
  const first = section.properties[0];
  const firstLine =
    first === undefined ? lineStart : text.lastIndexOf("\n", first.getStart(source) - 1) + 1;
  const inner = /^[ \t]*/.exec(text.slice(firstLine))?.[0] || `${outer}  `;
  const body =
    kept.length === 0 ? "{}" : `{\n${kept.map((entry) => inner + entry).join(",\n")}\n${outer}}`;
  return { start, end: section.getEnd(), text: body };
}
