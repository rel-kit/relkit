/**
 * Narrows named Effect barrel imports during prepared-command packaging only.
 * Each accepted name is the same public namespace reexported by pinned Effect 4.0.1;
 * unsupported imports remain unchanged. The Bun build plugin lives in
 * `narrow-effect-imports.bun.ts`; nothing here edits installed or authored module files.
 */
import ts from "../typescript-parser.js";

const namespaces = new Set([
  "Array",
  "Brand",
  "Cache",
  "Cause",
  "Channel",
  "Chunk",
  "Clock",
  "Config",
  "ConfigProvider",
  "Console",
  "Context",
  "Data",
  "DateTime",
  "Deferred",
  "Duration",
  "Effect",
  "Equal",
  "Exit",
  "Fiber",
  "Hash",
  "HashMap",
  "HashSet",
  "Layer",
  "Logger",
  "ManagedRuntime",
  "Match",
  "Metric",
  "MutableRef",
  "Option",
  "Queue",
  "Random",
  "References",
  "Ref",
  "Runtime",
  "Schedule",
  "Schema",
  "SchemaAST",
  "SchemaError",
  "SchemaGetter",
  "SchemaIssue",
  "Scope",
  "Semaphore",
  "Stream",
  "Struct",
  "Tracer",
]);
const functions = new Set(["absurd", "cast", "flow", "pipe"]);

/**
 * Preserves each named binding while selecting its public Effect owner directly.
 * @param source - Complete original module content supplied by Bun's native loader.
 * @param path - Native parser filename, used only for syntax classification.
 * @returns Equivalent source, or the original text for unsupported import forms.
 */
export function narrowEffectImports(source: string, path: string): string {
  if (!source.includes('"effect"') && !source.includes("'effect'")) return source;
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const replacements = parsed.statements.flatMap((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "effect"
    )
      return [];
    const clause = statement.importClause;
    const names = clause?.namedBindings;
    if (
      clause === undefined ||
      clause.name !== undefined ||
      names === undefined ||
      !ts.isNamedImports(names) ||
      names.elements.length === 0 ||
      statement.attributes !== undefined
    )
      return [];
    const supported = names.elements.every((element) => {
      const name = element.propertyName?.text ?? element.name.text;
      return namespaces.has(name) || functions.has(name);
    });
    if (!supported) return [];
    const text = names.elements
      .map((element) => {
        const name = element.propertyName?.text ?? element.name.text;
        const type = clause.isTypeOnly || element.isTypeOnly ? "type " : "";
        return namespaces.has(name)
          ? `import ${type}* as ${element.name.text} from "effect/${name}";`
          : `import ${type}{ ${name}${name === element.name.text ? "" : ` as ${element.name.text}`} } from "effect/Function";`;
      })
      .join("\n");
    return [{ start: statement.getStart(parsed), end: statement.end, text }];
  });
  let result = source;
  for (const replacement of replacements.reverse())
    result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
  return result;
}
