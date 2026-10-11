/**
 * Conservatively accepts declarative generated compilation inputs. It does not
 * execute source: top-level effects, environment/time/random reads, dynamic imports
 * and unaudited factories are ineligible. Runtime handlers stay deferred, while
 * schema/config construction must use the explicit pure authoring allowlist.
 */
import ts from "typescript";
import { posix } from "node:path";
import { assertPureExpression } from "./snapshot-eligibility-expressions.js";
import { Effect } from "effect";
import { DevSnapshotRejected } from "./snapshot-error.js";

const factories = new Map([
  ["@langchain/langgraph", new Set(["END", "MemorySaver", "START", "StateSchema", "interrupt"])],
  ["@relkit/app/agents", new Set(["defineAgent", "defineGraph", "defineGraphNode"])],
  ["@relkit/app/config", new Set(["defineApp", "defineEnv", "env"])],
  ["@relkit/app/functions", new Set(["defineFunction"])],
  ["@relkit/app/jobs", new Set(["defineJob"])],
  ["@relkit/app/services", new Set(["defineService"])],
  ["@relkit/app/routes", new Set(["defineRoute", "defineServiceRoutes"])],
  ["@relkit/app/schema", new Set(["z"])],
  ["@relkit/app/tasks", new Set(["defineTask"])],
  ["@relkit/local", new Set(["localAgentState", "localRealtime"])],
  ["langchain", new Set(["FakeToolCallingModel", "todoListMiddleware", "tool"])],
]);

/**
 * Checks one actual compilation source before treating it as cacheable.
 * @param source - Complete contained project source bytes, never environment content.
 * @param path - Portable identity used only to parse syntax, never retained in errors.
 * @returns Lazy eligibility or typed ineligibility; syntax/semantic checking still runs separately.
 */
export function verifyStaticSnapshotSource(source: string, path: string) {
  return Effect.try({
    try: () => assertStaticSource(source, path),
    catch: () =>
      new DevSnapshotRejected({ reason: "ineligible", operation: "compilation.dynamic" }),
  });
}

/**
 * Validates imports and top-level initialization against known pure constructors.
 * @param source - Complete UTF-8 compilation input.
 * @param path - Portable parser filename.
 * @returns Completion for declarative source.
 * @throws Error when an initializer or import cannot be proven eligible.
 */
function assertStaticSource(source: string, path: string): void {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const bindings = new Map<string, string>();
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      readPureImports(statement, bindings, path);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0)
        throw new Error("Mutable initialization");
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer !== undefined)
          assertPureExpression(declaration.initializer, bindings);
        bindLocalDeclaration(declaration.name, bindings);
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      assertPureExpression(statement.expression, bindings);
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier === undefined) continue;
    if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEmptyStatement(statement)
    )
      continue;
    throw new Error("Effectful top-level statement");
  }
}

/** Records immutable local names, including generated route destructuring. */
function bindLocalDeclaration(name: ts.BindingName, bindings: Map<string, string>): void {
  if (ts.isIdentifier(name)) {
    if (bindings.has(name.text)) throw new Error("Ambiguous binding");
    bindings.set(name.text, "local");
    return;
  }
  if (!ts.isObjectBindingPattern(name)) throw new Error("Dynamic binding");
  for (const element of name.elements) {
    if (
      element.dotDotDotToken !== undefined ||
      element.initializer !== undefined ||
      !ts.isIdentifier(element.name) ||
      bindings.has(element.name.text)
    )
      throw new Error("Ambiguous binding");
    bindings.set(element.name.text, "local");
  }
}

/**
 * Records approved pure constructors or references to separately audited local data.
 * @param statement - Parsed static import declaration.
 * @param bindings - Local module binding table updated in declaration order.
 * @param path - Portable source identity used to reject escaped or excluded local imports.
 * @returns Completion for an eligible import.
 * @throws Error for side-effect imports, namespaces or unaudited external symbols.
 */
function readPureImports(
  statement: ts.ImportDeclaration,
  bindings: Map<string, string>,
  path: string,
): void {
  const module = statement.moduleSpecifier;
  const clause = statement.importClause;
  if (!ts.isStringLiteral(module) || clause === undefined) throw new Error("Effectful import");
  if (clause.isTypeOnly) return;
  const allowed = factories.get(module.text);
  const names = clause.namedBindings;
  if (allowed !== undefined && names !== undefined && ts.isNamedImports(names)) {
    for (const element of names.elements) {
      const name = element.propertyName?.text ?? element.name.text;
      if (!allowed.has(name)) throw new Error("Unaudited authoring import");
      bindings.set(element.name.text, name);
    }
    return;
  }
  if (!(
    module.text.startsWith("@app/") ||
    module.text.startsWith("./") ||
    module.text.startsWith("../")
  ))
    throw new Error("Unaudited module import");
  const resolved = module.text.startsWith("@app/")
    ? `src/${module.text.slice(5)}`
    : posix.normalize(posix.join(posix.dirname(path), module.text));
  if (
    resolved.startsWith("../") ||
    resolved
      .split("/")
      .some(
        (segment) =>
          ["tests", "web", ".relkit", "node_modules"].includes(segment) ||
          segment === ".env" ||
          segment.startsWith(".env."),
      )
  )
    throw new Error("Uncaptured local import");
  if (clause.name !== undefined) bindings.set(clause.name.text, "local");
  if (names !== undefined) {
    if (!ts.isNamedImports(names)) throw new Error("Unaudited namespace import");
    for (const element of names.elements) bindings.set(element.name.text, "local");
  }
}
