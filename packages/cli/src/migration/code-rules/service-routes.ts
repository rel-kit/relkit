/**
 * Rule `service-routes`: route modules export their `defineServiceRoutes` map as the default
 * export instead of destructuring methods. `export const { GET, POST } = defineServiceRoutes(…)`
 * becomes `export default defineServiceRoutes(…)`. A module that already has a default export,
 * or that reads one of the destructured names, is reported, because the map would replace or
 * break it.
 */
import { codeSyntax as ts, parseCodeSource } from "../code-parser.js";
import { applyTextEdits, findingAt, type TextEdit } from "../code-edits.js";
import { bindingReferences } from "../code-imports.js";
import type { CodeFinding, CodeRule } from "../code-migration.types.js";
import { relkitLocals } from "./rule-support.js";

const id = "service-routes";

export const serviceRoutesRule: CodeRule = {
  id,
  summary: "Export defineServiceRoutes maps as the default export",
  guide: "service-routes",
  markdown: true,
  appliesTo: (path) => /\.[cm]?[jt]sx?$/.test(path),
  apply: (file) => {
    const source = parseCodeSource(file.path, file.text);
    const locals = relkitLocals(source, "defineServiceRoutes");
    const edits: TextEdit[] = [];
    const findings: CodeFinding[] = [];
    const hasDefault = source.statements.some(
      (statement) =>
        ts.isExportAssignment(statement) ||
        (ts.canHaveModifiers(statement) &&
          (ts.getModifiers(statement) ?? []).some(
            (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
          )),
    );
    for (const statement of source.statements) {
      const declaration = destructuredRoutes(statement, locals);
      if (declaration === undefined) continue;
      const names = declaration.pattern.elements.map((element) => element.name.getText(source));
      const used = names.some((name) => bindingReferences(source, name).length > 1);
      if (hasDefault || used) {
        findings.push(
          findingAt(
            source,
            statement,
            id,
            hasDefault
              ? "This route module already has a default export; export the defineServiceRoutes map as its default by hand."
              : "The destructured route handlers are used in this module; export the map as default and read handlers from it.",
          ),
        );
        continue;
      }
      edits.push({
        start: statement.getStart(source),
        end: statement.getEnd(),
        text: `export default ${declaration.initializer.getText(source)};`,
      });
    }
    return { text: applyTextEdits(file.text, edits), findings };
  },
};

/**
 * Matches `export const { … } = defineServiceRoutes(…)`.
 * @param statement - Top-level statement.
 * @param locals - Local names of `defineServiceRoutes`.
 * @returns The destructuring pattern and call, when the statement has that shape.
 */
function destructuredRoutes(statement: ts.Statement, locals: ReadonlySet<string>) {
  if (!ts.isVariableStatement(statement)) return undefined;
  const exported = (ts.getModifiers(statement) ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
  const [declaration, ...rest] = statement.declarationList.declarations;
  if (!exported || declaration === undefined || rest.length > 0) return undefined;
  const { name, initializer } = declaration;
  if (
    !ts.isObjectBindingPattern(name) ||
    initializer === undefined ||
    !ts.isCallExpression(initializer) ||
    !ts.isIdentifier(initializer.expression) ||
    !locals.has(initializer.expression.text)
  )
    return undefined;
  return { pattern: name, initializer };
}
