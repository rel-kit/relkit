/**
 * Small syntax queries several codemod rules share: whether a module is a RelKit authoring
 * module, which local names call a RelKit `define*` function, and the object literal a
 * `define*({ ... })` call receives. Pure functions over a parsed file.
 */
import { codeSyntax as ts, type CodeSource } from "../code-parser.js";
import { namedImports } from "../code-imports.js";
import { walk } from "../code-edits.js";

/**
 * Tells whether a module specifier is a RelKit authoring module, in its 0.8 or 0.9 spelling.
 * @param module - Module specifier.
 * @returns True for `relkit`, `relkit/*`, `@relkit/app` and the former area packages.
 */
export function isRelkitModule(module: string): boolean {
  return (
    module === "relkit" ||
    module.startsWith("relkit/") ||
    /^@relkit\/(?:app|functions|events|jobs|routes|schema|config|agents|realtime|tools|services)(?:\/|$)/.test(
      module,
    )
  );
}

/**
 * Lists the local names bound to an export of RelKit authoring modules.
 * @param source - Parsed file.
 * @param name - Exported name such as `defineFunction`.
 * @returns Local bindings (usually just the name itself).
 */
export function relkitLocals(source: CodeSource, name: string): Set<string> {
  return new Set(
    namedImports(source, isRelkitModule)
      .filter((entry) => entry.imported === name)
      .map((entry) => entry.local),
  );
}

/** A `define*({ ... })` call and its options object. */
export interface DefineCall {
  readonly call: ts.CallExpression;
  readonly options: ts.ObjectLiteralExpression;
  readonly callee: string;
}

/**
 * Finds calls of the given local functions whose first argument is an object literal.
 * @param source - Parsed file.
 * @param callees - Local function names.
 * @returns Calls in source order.
 */
export function defineCalls(source: CodeSource, callees: ReadonlySet<string>): DefineCall[] {
  const found: DefineCall[] = [];
  walk(source, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      callees.has(node.expression.text) &&
      node.arguments[0] !== undefined &&
      ts.isObjectLiteralExpression(node.arguments[0])
    )
      found.push({ call: node, options: node.arguments[0], callee: node.expression.text });
  });
  return found;
}

/**
 * Collects the local names of several RelKit exports at once.
 * @param source - Parsed file.
 * @param names - Exported names.
 * @returns The union of their local bindings.
 */
export function relkitLocalsOf(source: CodeSource, names: readonly string[]): Set<string> {
  const locals = new Set<string>();
  for (const name of names) for (const local of relkitLocals(source, name)) locals.add(local);
  return locals;
}
