/**
 * Records statically visible request-lifecycle usage inside service-owned modules:
 * `.invoke(` calls through imported services or functions, Drizzle table operations
 * through `context.database`, and `.trigger(` calls on imported channels. Nothing in
 * this syntax walk evaluates application code; identities are resolved later against
 * normalized descriptors when graph edges are emitted.
 */
import { applicationSourceLayer, type ApplicationLayout } from "@relkit/contracts";
import { Effect } from "effect";
import * as ts from "typescript";
import { observeCompiler } from "./observability.js";
import { SourceResolution } from "./source-resolution.service.js";
import type { NormalizationWork, SourceUsage } from "./normalize-types.js";

const WRITE_METHODS: ReadonlySet<string> = new Set([
  "insert",
  "update",
  "delete",
  "upsert",
  "create",
]);
const READ_METHODS: ReadonlySet<string> = new Set([
  "findOne",
  "findMany",
  "find",
  "count",
  "list",
  "select",
]);

/**
 * Classifies a Drizzle model method as a table read or write.
 * @param method - Property name called on `context.database.<table>`.
 * @returns The access kind, or undefined for methods the graph does not record.
 * @example accessFor("insert") === "write"; accessFor("parse") === undefined;
 */
export function accessFor(method: string): "read" | "write" | undefined {
  if (WRITE_METHODS.has(method)) return "write";
  if (READ_METHODS.has(method)) return "read";
  return undefined;
}

/**
 * Collects import-resolved usage evidence for one service-owned source file.
 * @param work - Invocation-owned usage index updated in place.
 * @param layout - Shared service ownership interpretation.
 * @param source - Parsed module with project-relative filename.
 * @returns A lazy update requiring the invocation's SourceResolution service.
 * @remarks Files outside a service root, including routes-layer middleware, are skipped.
 */
export const collectSourceUsageEffect = Effect.fn("Compiler.collectSourceUsage")(
  function* (work: NormalizationWork, layout: ApplicationLayout, source: ts.SourceFile) {
    const owner = applicationSourceLayer(layout, source.fileName);
    if (owner.kind !== "service") return;
    const resolver = yield* SourceResolution;
    const bindings = new Map<string, string>();
    const helpers = new Set<string>();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier))
        continue;
      const resolved = yield* resolver.resolve(source.fileName, statement.moduleSpecifier.text);
      if (resolved.kind !== "source") continue;
      const target = applicationSourceLayer(layout, resolved.file);
      if (
        target.kind === "service" &&
        target.service.name === owner.service.name &&
        resolved.file !== owner.service.boundary
      )
        helpers.add(resolved.file);
      for (const binding of importBindings(statement)) bindings.set(binding, resolved.file);
    }
    const usage = walk(source, bindings);
    work.sourceUsage.set(source.fileName, {
      file: source.fileName,
      service: owner.service.name,
      calls: usage.calls,
      tables: usage.tables,
      channels: usage.channels,
      helpers: [...helpers].sort().map((file) => ({ file })),
    });
  },
  (effect) => observeCompiler("normalization", "collectSourceUsage", effect),
);

/**
 * Lists value bindings introduced by one static import declaration.
 * @param statement - Import declaration with a literal specifier.
 * @returns Default and named value bindings; type-only and namespace imports are ignored.
 */
function importBindings(statement: ts.ImportDeclaration): readonly string[] {
  const clause = statement.importClause;
  if (clause === undefined || clause.isTypeOnly) return [];
  const names: string[] = [];
  if (clause.name !== undefined) names.push(clause.name.text);
  if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
    for (const element of clause.namedBindings.elements) {
      if (!element.isTypeOnly) names.push(element.name.text);
    }
  }
  return names;
}

interface WalkResult {
  readonly calls: { readonly file: string; readonly member?: string }[];
  readonly tables: { readonly property: string; readonly method: string }[];
  readonly channels: { readonly file: string }[];
}

/**
 * Walks every call expression while tracking `transaction` callback parameters.
 * @param source - Parsed module.
 * @param bindings - Import binding name to resolved project-relative file.
 * @returns Source-ordered call, table, and channel evidence.
 */
function walk(source: ts.SourceFile, bindings: ReadonlyMap<string, string>): WalkResult {
  const result: WalkResult = { calls: [], tables: [], channels: [] };
  const transactions: string[] = [];
  const isDatabase = (node: ts.Expression): boolean =>
    (ts.isPropertyAccessExpression(node) &&
      node.name.text === "database" &&
      ts.isIdentifier(node.expression)) ||
    (ts.isIdentifier(node) && transactions.includes(node.text));
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression;
      if (method === "invoke") {
        if (ts.isIdentifier(receiver)) {
          const file = bindings.get(receiver.text);
          if (file !== undefined) result.calls.push({ file });
        } else if (
          ts.isPropertyAccessExpression(receiver) &&
          ts.isIdentifier(receiver.expression)
        ) {
          const file = bindings.get(receiver.expression.text);
          if (file !== undefined) result.calls.push({ file, member: receiver.name.text });
        }
      } else if (method === "trigger" && ts.isIdentifier(receiver)) {
        const file = bindings.get(receiver.text);
        if (file !== undefined) result.channels.push({ file });
      } else if (method === "transaction" && isDatabase(receiver)) {
        const callback = node.arguments[0];
        const parameter =
          callback !== undefined &&
          (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
            ? callback.parameters[0]?.name
            : undefined;
        if (callback !== undefined && parameter !== undefined && ts.isIdentifier(parameter)) {
          visit(node.expression);
          transactions.push(parameter.text);
          ts.forEachChild(callback, visit);
          transactions.pop();
          for (const argument of node.arguments.slice(1)) visit(argument);
          return;
        }
      } else if (ts.isPropertyAccessExpression(receiver) && isDatabase(receiver.expression)) {
        result.tables.push({ property: receiver.name.text, method });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}
