/**
 * Rule `schema-builder`: the built-in schema builder is exported as `s` instead of `z` from
 * `relkit/schema`. An import of `z` becomes `s` and every reference is renamed; when the file
 * already uses the name `s`, the import becomes `s as z` so no other binding changes. Imports
 * of `z` from `zod` are not touched.
 */
import { codeSyntax as ts, parseCodeSource } from "../code-parser.js";
import { applyTextEdits, walk, type TextEdit } from "../code-edits.js";
import { namedImports, renameReferences } from "../code-imports.js";
import type { CodeRule } from "../code-migration.types.js";

/** Modules that export the built-in builder. */
export const schemaModules = ["relkit/schema", "@relkit/app/schema", "@relkit/schema"];

export const schemaBuilderRule: CodeRule = {
  id: "schema-builder",
  summary: "Rename the built-in schema builder from z to s",
  guide: "schema-builder",
  markdown: true,
  appliesTo: (path) => /\.[cm]?[jt]sx?$/.test(path),
  apply: (file) => {
    const source = parseCodeSource(file.path, file.text);
    const edits: TextEdit[] = [];
    for (const entry of namedImports(source, (module) => schemaModules.includes(module))) {
      if (entry.imported !== "z") continue;
      const aliased = entry.local !== "z";
      if (aliased || declaresName(source, "s")) {
        edits.push({
          start: entry.specifier.getStart(source),
          end: entry.specifier.getEnd(),
          text: `${entry.specifier.isTypeOnly ? "type " : ""}s as ${entry.local}`,
        });
        continue;
      }
      edits.push({
        start: entry.specifier.getStart(source),
        end: entry.specifier.getEnd(),
        text: `${entry.specifier.isTypeOnly ? "type " : ""}s`,
      });
      edits.push(...renameReferences(source, "z", "s"));
    }
    return { text: applyTextEdits(file.text, edits), findings: [] };
  },
};

/**
 * Tells whether any identifier in the file already uses a name.
 * @param source - Parsed file.
 * @param name - Candidate binding name.
 * @returns True when renaming to `name` could capture or shadow another binding.
 */
function declaresName(source: ts.SourceFile, name: string): boolean {
  let found = false;
  walk(source, (node) => {
    if (ts.isIdentifier(node) && node.text === name) found = true;
  });
  return found;
}
