/**
 * Records every export of the `relkit` root. The root is a curated list of Promise APIs and the
 * types applications write against; adding or removing a name updates `root-exports.json` in the
 * same change. Effect forms live in `relkit/effect`, everything else on its `relkit/<area>` subpath.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";
import * as root from "../../src/index.js";
import * as effect from "../../src/app/effect.js";

const entry = fileURLToPath(new URL("../../src/index.ts", import.meta.url));
const recorded = JSON.parse(
  readFileSync(new URL("./root-exports.json", import.meta.url), "utf8"),
) as { readonly values: readonly string[]; readonly types: readonly string[] };

function declaredExports(): { values: string[]; types: string[] } {
  const program = ts.createProgram([entry], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  const module = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (module === undefined) throw new Error("The relkit root entry did not load.");
  const values: string[] = [];
  const types: string[] = [];
  for (const symbol of checker.getExportsOfModule(module)) {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    (target.flags & ts.SymbolFlags.Value ? values : types).push(symbol.name);
  }
  return { values: values.sort(), types: types.sort() };
}

it("exports exactly the recorded root names", () => {
  expect(declaredExports()).toEqual(recorded);
});

it("loads the recorded values at run time and no others", () => {
  expect(Object.keys(root).sort()).toEqual(recorded.values);
});

it("keeps Effect forms out of the root and in relkit/effect", () => {
  // `ToolSideEffect` names a tool's read or write side effect, not an Effect.
  expect(recorded.values.filter((name) => /Effects?$|Live$|Layer$/.test(name))).toEqual([]);
  expect(Object.keys(effect).sort()).toEqual([
    "FunctionOperationError",
    "callGraphNodeEffect",
    "callToolEffect",
    "defineAgentEffect",
    "defineAppEffect",
    "defineBucketEffect",
    "defineCacheEffect",
    "defineChannelEffect",
    "defineConstantsEffect",
    "defineEnvEffect",
    "defineErrorEffect",
    "defineFunctionEffect",
    "defineJobEffect",
    "defineMiddlewareEffect",
    "definePromptEffect",
    "defineRouteEffect",
    "defineServiceEffect",
    "defineServiceRoutesEffect",
    "defineTaskEffect",
    "defineToolEffect",
    "defineTransformEffect",
    "failEffect",
    "httpEffects",
    "streamOfEffect",
  ]);
});
