/** Copies unchanged native restart probes, resolving only their repository-relative imports before a whole service move. */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";
import { Effect } from "effect";
import { scaffoldNative } from "../../scripts/scaffold-native.js";

/**
 * Keeps borrowed SDK source imports stable while copying an unchanged native worker into an owned application boundary.
 * @param original - Read-only native restart probe.
 * @param destination - Test-owned service file.
 * @returns Joined source publication with every repository SDK import resolved to its actual file.
 */
export const copyRestartSource = Effect.fn("RestartLayout.copySource")(
  (original: string, destination: string) =>
    scaffoldNative("restart.layout.copy", async () => {
      const source = await readFile(original, "utf8");
      const parsed = ts.createSourceFile(original, source, ts.ScriptTarget.Latest, true);
      const edits: ts.TextChange[] = [];
      for (const statement of parsed.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
          continue;
        const reference = statement.moduleSpecifier;
        if (!reference.text.startsWith(".")) continue;
        const resolved = resolve(dirname(original), reference.text);
        if (dirname(resolved) === dirname(original)) continue;
        edits.push({
          span: { start: reference.getStart(parsed), length: reference.getWidth(parsed) },
          newText: JSON.stringify(pathToFileURL(resolved).href),
        });
      }
      let output = source;
      for (const edit of edits.reverse())
        output =
          output.slice(0, edit.span.start) +
          edit.newText +
          output.slice(edit.span.start + edit.span.length);
      await writeFile(destination, output);
    }),
);
