import { Effect } from "effect";
import * as ts from "typescript";
import { observeCompiler } from "../observability.js";
import type { AstReExport } from "./ast-prefilter.types.js";

/**
 * Projects a runtime re-export into source evidence.
 * @param node - Unevaluated export already checked for runtime content.
 * @returns A lazy effect yielding named/wildcard evidence, or undefined for unsupported syntax.
 */
export const readReExportEffect = Effect.fn("Discovery.readReExport")(
  function* (node: ts.ExportDeclaration): Generator<never, AstReExport | undefined, never> {
    if (!node.moduleSpecifier || !ts.isStringLiteralLike(node.moduleSpecifier)) return undefined;
    if (!node.exportClause)
      return { moduleSpecifier: node.moduleSpecifier.text, names: ["*"], exportAll: true };
    if (!ts.isNamedExports(node.exportClause)) return undefined;
    const names = node.exportClause.elements
      .filter((element) => !element.isTypeOnly)
      .map((element) => element.name.text);
    return names.length === 0
      ? undefined
      : {
          moduleSpecifier: node.moduleSpecifier.text,
          names: [...new Set(names)].sort(),
          exportAll: false,
        };
  },
  (effect) => observeCompiler("discovery", "readReExport", effect, () => ({}), false),
);
