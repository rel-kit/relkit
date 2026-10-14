/** Rewrites syntax-recognized JSON/JSONC path fields without replacing metadata or comments. */
import * as ts from "typescript";
import { applyTextEdits, mentionsMovedRoot, rewrittenToolPath } from "./layout-rewrite-paths.js";
import { rewriteLayoutShell } from "./layout-rewrite-shell.js";
import type { MigrationMove } from "./layout.types.js";
import type { LayoutRewrite, LayoutTextEdit } from "./layout-rewrite.types.js";

/**
 * Parses configuration and package command fields before selecting their exact literal edits.
 * @param file - Authored JSON or JSONC file.
 * @param text - Complete original bytes.
 * @param moves - Complete selected service roots.
 * @returns Preserved surrounding syntax, explicit path edits and manual-action findings.
 */
export function rewriteLayoutJson(
  file: string,
  text: string,
  moves: readonly MigrationMove[],
): LayoutRewrite {
  if (ts.parseConfigFileTextToJson(file, text).error)
    return {
      text,
      conflicts: [
        { file, message: "Cannot parse affected JSON configuration; correct it before migration." },
      ],
    };
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSON);
  const edits: LayoutTextEdit[] = [];
  const conflicts: LayoutRewrite["conflicts"][number][] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) && mentionsMovedRoot(node.text, moves)) {
      const result = literalRewrite(file, node, moves);
      conflicts.push(...result.conflicts);
      if (result.text !== node.text)
        edits.push({
          start: node.getStart(source),
          end: node.getEnd(),
          text: JSON.stringify(result.text),
        });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { text: applyTextEdits(text, edits), conflicts };
}

/**
 * Distinguishes a known literal field from unrelated metadata or an ambiguous path.
 * @param file - Authored JSON filename.
 * @param literal - Parsed string value with parent links.
 * @param moves - Selected service roots.
 * @returns Its changed value or an unchanged manual-action finding.
 */
function literalRewrite(
  file: string,
  literal: ts.StringLiteral,
  moves: readonly MigrationMove[],
): LayoutRewrite {
  if (knownJsonPath(file, literal)) {
    if (file === "package.json") return rewriteLayoutShell(file, literal.text, moves);
    const text = rewrittenToolPath(literal.text, moves);
    if (!mentionsMovedRoot(text, moves)) return { text, conflicts: [] };
  }
  return {
    text: literal.text,
    conflicts: [
      {
        file,
        message: `Ambiguous JSON path at offset ${literal.getStart()}; review and update it manually before write.`,
      },
    ],
  };
}

/**
 * Identifies documented configuration path positions without treating every string as a reference.
 * @param file - Authored JSON filename.
 * @param literal - Parsed string value.
 * @returns Whether syntax identifies a path-bearing field.
 */
function knownJsonPath(file: string, literal: ts.StringLiteral): boolean {
  const names: string[] = [];
  let parent: ts.Node | undefined = literal.parent;
  while (parent) {
    if (ts.isPropertyAssignment(parent)) names.push(parent.name.getText().replace(/^"|"$/g, ""));
    parent = parent.parent;
  }
  if (file === "package.json") return names.includes("scripts");
  if (/(?:^|\/)tsconfig[^/]*\.jsonc?$/.test(file))
    return names.some((name) =>
      ["paths", "include", "exclude", "files", "rootDirs", "rootDir"].includes(name),
    );
  return names.some((name) =>
    ["schema", "schemaPath", "seed", "entry", "input", "source"].includes(name),
  );
}
