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
import { isSnapshotFunctionImport, isSnapshotFunctionValue } from "./snapshot-function-bindings.js";

const factories = new Map([
  ["@langchain/langgraph", new Set(["END", "MemorySaver", "START", "StateSchema", "interrupt"])],
  ["@relkit/app/agents", new Set(["defineAgent", "defineGraph", "defineGraphNode"])],
  ["@relkit/app/config", new Set(["defineApp", "defineEnv", "env"])],
  ["@relkit/app/functions", new Set(["defineFunction", "defineError"])],
  ["@relkit/better-auth", new Set(["defineBetterAuthService"])],
  ["@relkit/drizzle", new Set(["defineDrizzleService"])],
  [
    "drizzle-orm/sqlite-core",
    new Set(["integer", "text", "sqliteTable", "check", "primaryKey", "uniqueIndex"]),
  ],
  ["drizzle-orm", new Set(["sql"])],
  ["bun:sqlite", new Set(["Database"])],
  ["node:fs", new Set(["mkdirSync"])],
  ["node:path", new Set(["dirname"])],
  ["drizzle-orm/bun-sqlite", new Set(["drizzle"])],
  ["@relkit/app/jobs", new Set(["defineJob"])],
  ["@relkit/app/services", new Set(["defineService"])],
  ["@relkit/app/routes", new Set(["defineRoute", "defineServiceRoutes"])],
  ["@relkit/app/schema", new Set(["z"])],
  ["@relkit/app/tasks", new Set(["defineTask"])],
  ["@relkit/local", new Set(["localAgentState", "localRealtime"])],
  ["langchain", new Set(["FakeToolCallingModel", "todoListMiddleware", "tool"])],
]);

/** Detects authored files or package self-references that could shadow an audited import. */
export function isSnapshotFactoryShadow(path: string): boolean {
  const identity = path.toLowerCase();
  return [...factories.keys()].some((module) => {
    const parts = module.split("/");
    const name = module.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
    return (
      identity === name ||
      identity.startsWith(`${name}/`) ||
      identity.replace(/\.(?:[cm]?[jt]sx?|json)$/, "") === name
    );
  });
}

/**
 * Checks one actual compilation source before treating it as cacheable.
 * @param source - Complete contained project source bytes, never environment content.
 * @param path - Portable identity used only to parse syntax, never retained in errors.
 * @returns Lazy eligibility or typed ineligibility; syntax/semantic checking still runs separately.
 */
export function verifyStaticSnapshotSource(
  source: string,
  path: string,
  sources: ReadonlyMap<string, string> = new Map(),
) {
  return Effect.try({
    try: () => assertStaticSource(source, path, sources),
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
function assertStaticSource(
  source: string,
  path: string,
  sources: ReadonlyMap<string, string>,
): void {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const bindings = new Map<string, string>();
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      readPureImports(statement, bindings, path, sources);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0)
        throw new Error("Mutable initialization");
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer !== undefined)
          assertPureExpression(declaration.initializer, bindings);
        const descriptor =
          declaration.initializer !== undefined &&
          isSnapshotFunctionValue(declaration.initializer, bindings);
        bindLocalDeclaration(declaration.name, bindings);
        if (descriptor && ts.isIdentifier(declaration.name))
          bindings.set(declaration.name.text, "function-descriptor");
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      assertPureExpression(statement.expression, bindings);
      continue;
    }
    if (ts.isFunctionDeclaration(statement)) {
      if (
        statement.name === undefined ||
        statement.modifiers?.some(
          (modifier) =>
            ![
              ts.SyntaxKind.ExportKeyword,
              ts.SyntaxKind.DefaultKeyword,
              ts.SyntaxKind.AsyncKeyword,
            ].includes(modifier.kind),
        )
      )
        throw new Error("Unaudited function declaration");
      bindLocalDeclaration(statement.name, bindings);
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (statement.attributes !== undefined) throw new Error("Unaudited export attributes");
      if (statement.moduleSpecifier !== undefined && !statement.isTypeOnly) {
        if (!ts.isStringLiteral(statement.moduleSpecifier)) throw new Error("Dynamic reexport");
        assertLocalImport(statement.moduleSpecifier.text, path);
      }
      continue;
    }
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
    assertBindingName(name.text);
    if (bindings.has(name.text)) throw new Error("Ambiguous binding");
    bindings.set(name.text, "local");
    return;
  }
  if (!ts.isObjectBindingPattern(name)) throw new Error("Dynamic binding");
  for (const element of name.elements) {
    if (
      element.dotDotDotToken !== undefined ||
      element.initializer !== undefined ||
      (element.propertyName !== undefined &&
        !ts.isIdentifier(element.propertyName) &&
        !ts.isStringLiteral(element.propertyName)) ||
      !ts.isIdentifier(element.name) ||
      bindings.has(element.name.text)
    )
      throw new Error("Ambiguous binding");
    assertBindingName(element.name.text);
    bindings.set(element.name.text, "local");
  }
}

/**
 * Records approved pure constructors or references to separately audited local data.
 * @param statement - Parsed static import declaration.
 * @param bindings - Local module binding table updated in declaration order.
 * @param path - Portable source identity used to reject escaped or excluded local imports.
 * @returns Completion for an eligible import.
 * @throws Error for side-effect imports or unaudited external symbols and paths.
 */
function readPureImports(
  statement: ts.ImportDeclaration,
  bindings: Map<string, string>,
  path: string,
  sources: ReadonlyMap<string, string>,
): void {
  const module = statement.moduleSpecifier;
  const clause = statement.importClause;
  if (!ts.isStringLiteral(module) || clause === undefined) throw new Error("Effectful import");
  if (statement.attributes !== undefined) throw new Error("Unaudited import attributes");
  if (clause.isTypeOnly) return;
  const allowed = factories.get(module.text);
  const names = clause.namedBindings;
  if (clause.name !== undefined) assertBindingName(clause.name.text);
  if (names !== undefined) {
    if (ts.isNamespaceImport(names)) assertBindingName(names.name.text);
    else for (const element of names.elements) assertBindingName(element.name.text);
  }
  if (allowed !== undefined && names !== undefined && ts.isNamedImports(names)) {
    for (const element of names.elements) {
      const name = element.propertyName?.text ?? element.name.text;
      if (!allowed.has(name)) throw new Error("Unaudited authoring import");
      bindings.set(
        element.name.text,
        module.text === "drizzle-orm/sqlite-core" || module.text === "drizzle-orm"
          ? `sqlite:${name}`
          : ["bun:sqlite", "drizzle-orm/bun-sqlite", "node:fs", "node:path"].includes(module.text)
            ? "runtime-only"
            : name,
      );
    }
    return;
  }
  assertLocalImport(module.text, path);
  const kind = (name: string) =>
    isSnapshotFunctionImport(module.text, name, path, sources) ? "function-descriptor" : "local";
  if (clause.name !== undefined) bindings.set(clause.name.text, kind("default"));
  if (names !== undefined) {
    if (ts.isNamespaceImport(names)) bindings.set(names.name.text, "local");
    else
      for (const element of names.elements)
        bindings.set(element.name.text, kind(element.propertyName?.text ?? element.name.text));
  }
}

/** All runtime imports and reexports stay within the audited backend source inventory. */
function assertLocalImport(module: string, path: string): void {
  if (!(module.startsWith("@app/") || module.startsWith("./") || module.startsWith("../")))
    throw new Error("Unaudited module import");
  const resolved = module.startsWith("@app/")
    ? posix.normalize(`src/${module.slice(5)}`)
    : posix.normalize(posix.join(posix.dirname(path), module));
  if (
    !resolved.startsWith("src/") ||
    !/\.(?:[cm]?[jt]sx?)$/.test(resolved) ||
    resolved.endsWith(".d.ts") ||
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
}

/** Reject even later declarations of native constructors, which can hoist. */
function assertBindingName(name: string): void {
  if (["URL", "String"].includes(name)) throw new Error("Shadowed snapshot builtin");
}
