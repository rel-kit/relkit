/**
 * Recognizes which local expressions are RelKit function or channel descriptors, by syntax
 * alone: bindings imported from `*.function` / `*.channel` modules, bindings created by
 * `defineFunction` / `defineChannel`, and members of a default-imported `service` module. Also
 * resolves project-relative imports (`./x.js`, `@app/…`) to source files so rules can read
 * declarations such as a service's ID or an event's export.
 */
import { posix } from "node:path";
import { codeSyntax as ts, type CodeSource } from "../code-parser.js";
import { literalText } from "../code-edits.js";
import type { CodeRuleContext } from "../code-migration.types.js";
import { relkitLocals } from "./rule-support.js";

/** A descriptor receiver and the context key it is reached by. */
export interface DescriptorReceiver {
  readonly kind: "function" | "channel";
  readonly key: string;
  readonly service?: { readonly binding: string; readonly module: string };
}

/**
 * Classifies the receiver of a `.invoke` / `.trigger` call.
 * @param source - Parsed file.
 * @param path - File path, for resolving imports.
 * @param expression - Receiver expression.
 * @returns The descriptor kind and key, or undefined when it is not clearly a descriptor.
 */
export function classifyReceiver(
  source: CodeSource,
  path: string,
  expression: ts.Expression,
): DescriptorReceiver | undefined {
  if (ts.isIdentifier(expression)) {
    const module = importModule(source, expression.text);
    if (module !== undefined) {
      if (/\.function(?:\.[cm]?[jt]sx?)?$/.test(module))
        return { kind: "function", key: expression.text };
      if (/\.channel(?:\.[cm]?[jt]sx?)?$/.test(module))
        return { kind: "channel", key: expression.text };
      return undefined;
    }
    const factory = localFactory(source, expression.text);
    if (factory !== undefined && relkitLocals(source, "defineFunction").has(factory))
      return { kind: "function", key: expression.text };
    if (factory !== undefined && relkitLocals(source, "defineChannel").has(factory))
      return { kind: "channel", key: expression.text };
    return undefined;
  }
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const module = importModule(source, expression.expression.text, true);
    if (module !== undefined && /(?:^|\/)service(?:\.[cm]?[jt]sx?)?$/.test(module))
      return {
        kind: "function",
        key: expression.name.text,
        service: { binding: expression.expression.text, module },
      };
  }
  return undefined;
}

/**
 * Finds the module a local name is imported from.
 * @param source - Parsed file.
 * @param local - Local binding.
 * @param defaultOnly - Only accept a default import.
 * @returns The module specifier, if the name is imported.
 */
export function importModule(source: CodeSource, local: string, defaultOnly = false) {
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue;
    const clause = statement.importClause;
    const module = literalText(statement.moduleSpecifier);
    if (clause.name?.text === local) return module;
    const bindings = clause.namedBindings;
    if (!defaultOnly && bindings && ts.isNamedImports(bindings))
      if (bindings.elements.some((element) => element.name.text === local)) return module;
  }
  return undefined;
}

/**
 * Reads the callee of `const name = factory(...)` at the top level.
 * @param source - Parsed file.
 * @param name - Binding name.
 * @returns The factory identifier text, if any.
 */
function localFactory(source: CodeSource, name: string): string | undefined {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations)
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer &&
        ts.isCallExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.expression)
      )
        return declaration.initializer.expression.text;
  }
  return undefined;
}

/**
 * Resolves a project-relative module specifier to a known source path.
 * @param context - Rule context with project sources.
 * @param from - Importing file path.
 * @param module - Specifier (`./x.js`, `../x`, `@app/x.js`).
 * @returns The source path, if one of the candidates exists.
 */
export function resolveSource(context: CodeRuleContext, from: string, module: string) {
  let base: string;
  if (module.startsWith("@app/")) base = posix.join("src", module.slice(5));
  else if (module.startsWith(".")) base = posix.join(posix.dirname(from), module);
  else return undefined;
  const stem = base.replace(/\.[cm]?[jt]sx?$/, "");
  const candidates = [base, `${stem}.ts`, `${stem}.tsx`, `${stem}.js`, `${stem}/index.ts`];
  return candidates.find((candidate) => context.sources.has(candidate));
}

/**
 * Reads the ID of the service a module defines.
 * @param context - Rule context with project sources.
 * @param from - Importing file.
 * @param module - Service module specifier.
 * @returns The explicit `defineService({ id })`, else the folder name the ID is inferred from.
 */
export function serviceIdOf(context: CodeRuleContext, from: string, module: string) {
  const path = resolveSource(context, from, module);
  const text = path === undefined ? undefined : context.sources.get(path);
  if (path === undefined || text === undefined) return undefined;
  const explicit = /defineService\(\s*\{[^}]*?\bid:\s*["']([^"']+)["']/s.exec(text)?.[1];
  // Without an explicit ID, a service's ID is the name of the folder that holds service.ts.
  return explicit ?? posix.basename(posix.dirname(path));
}
