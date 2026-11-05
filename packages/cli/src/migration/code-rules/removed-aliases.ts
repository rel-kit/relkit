/**
 * Rule `removed-aliases`: each concept keeps one spelling. `toJsonSchema` becomes
 * `getJsonSchema`, `defineRequestTransform` becomes `defineTransform`, the builder's
 * `undefined()` becomes `void()`, `defineApp`'s `job` provider key and `defaults.job` become
 * `jobs`, a job's `profile` becomes `service`, and a tool's `invokeEffect` becomes
 * `callToolEffect` from `relkit/effect`. When both spellings are already present the
 * rule reports the line instead of guessing which value wins.
 */
import { codeSyntax as ts, parseCodeSource, type CodeSource } from "../code-parser.js";
import { applyTextEdits, findingAt, objectProperty, walk, type TextEdit } from "../code-edits.js";
import { namedImports, removeNamedImport, renameReferences } from "../code-imports.js";
import type { CodeFinding, CodeRule } from "../code-migration.types.js";
import { schemaModules } from "./schema-builder.js";
import { defineCalls, isRelkitModule, relkitLocals } from "./rule-support.js";
import { invokeEffectCalls } from "./effect-calls.js";

const id = "removed-aliases";
const renamedExports: readonly (readonly [string, string])[] = [
  ["toJsonSchema", "getJsonSchema"],
  ["defineRequestTransform", "defineTransform"],
];

export const removedAliasesRule: CodeRule = {
  id,
  summary: "Use the one remaining spelling of renamed APIs and option keys",
  guide: "one-spelling",
  markdown: true,
  appliesTo: (path) => /\.[cm]?[jt]sx?$/.test(path),
  apply: (file) => {
    const source = parseCodeSource(file.path, file.text);
    const edits: TextEdit[] = [];
    const findings: CodeFinding[] = [];
    for (const [from, to] of renamedExports) edits.push(...renameExport(source, from, to));
    edits.push(...builderUndefined(source));
    edits.push(...invokeEffectCalls(source, id, findings));
    for (const { options } of defineCalls(source, relkitLocals(source, "defineApp"))) {
      renameKey(source, options, "job", "jobs", edits, findings);
      const defaults = objectProperty(options, "defaults");
      if (defaults && ts.isPropertyAssignment(defaults))
        if (ts.isObjectLiteralExpression(defaults.initializer))
          renameKey(source, defaults.initializer, "job", "jobs", edits, findings);
    }
    for (const { options } of defineCalls(source, relkitLocals(source, "defineJob")))
      renameKey(source, options, "profile", "service", edits, findings);
    return { text: applyTextEdits(file.text, edits), findings };
  },
};

/**
 * Renames an imported RelKit export and its references, merging into an existing import of
 * the new name.
 * @param source - Parsed file.
 * @param from - Removed export name.
 * @param to - Remaining export name.
 * @returns Edits for the import and the references.
 */
function renameExport(source: CodeSource, from: string, to: string): TextEdit[] {
  const imports = namedImports(source, isRelkitModule);
  const old = imports.find((entry) => entry.imported === from);
  if (old === undefined) return [];
  const existing = imports.find((entry) => entry.imported === to);
  if (existing !== undefined)
    return [
      removeNamedImport(source, old),
      ...(old.local === existing.local ? [] : renameReferences(source, old.local, existing.local)),
    ];
  const edits: TextEdit[] = [];
  if (old.local === from) {
    edits.push({ start: old.specifier.getStart(source), end: old.specifier.getEnd(), text: to });
    edits.push(...renameReferences(source, from, to));
  } else
    edits.push({
      start: (old.specifier.propertyName ?? old.specifier.name).getStart(source),
      end: (old.specifier.propertyName ?? old.specifier.name).getEnd(),
      text: to,
    });
  return edits;
}

/**
 * Rewrites `<builder>.undefined()` to `<builder>.void()` for the built-in builder.
 * @param source - Parsed file.
 * @returns One edit per call.
 */
function builderUndefined(source: CodeSource): TextEdit[] {
  const builders = new Set(
    namedImports(source, (module) => schemaModules.includes(module))
      .filter((entry) => entry.imported === "z" || entry.imported === "s")
      .map((entry) => entry.local),
  );
  const edits: TextEdit[] = [];
  walk(source, (node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "undefined" &&
      ts.isIdentifier(node.expression) &&
      builders.has(node.expression.text) &&
      ts.isCallExpression(node.parent)
    )
      edits.push({ start: node.name.getStart(source), end: node.name.getEnd(), text: "void" });
  });
  return edits;
}

/**
 * Renames an option key, or reports it when the new key is already set.
 * @param source - Parsed file.
 * @param object - Options object.
 * @param from - Removed key.
 * @param to - Remaining key.
 * @param edits - Edit collector.
 * @param findings - Finding collector.
 * @returns Nothing.
 */
function renameKey(
  source: CodeSource,
  object: ts.ObjectLiteralExpression,
  from: string,
  to: string,
  edits: TextEdit[],
  findings: CodeFinding[],
): void {
  const old = objectProperty(object, from);
  if (old === undefined) return;
  if (objectProperty(object, to) !== undefined) {
    findings.push(findingAt(source, old, id, `Both ${from} and ${to} are set; keep only ${to}.`));
    return;
  }
  if (ts.isShorthandPropertyAssignment(old))
    edits.push({ start: old.getStart(source), end: old.getEnd(), text: `${to}: ${from}` });
  else edits.push({ start: old.name.getStart(source), end: old.name.getEnd(), text: to });
}
