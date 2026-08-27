import { describe, expect, test } from "bun:test";
import { prefilterSources } from "../../packages/compiler/src/discovery/ast-prefilter.ts";

describe("AST discovery prefilter", () => {
  test("finds syntax candidates without evaluating ordinary source", () => {
    const marker = "__relkit_ast_prefilter_evaluated__";
    delete (globalThis as Record<string, unknown>)[marker];
    const result = prefilterSources([
      {
        fileName: "src/helper.ts",
        text: `globalThis.${marker} = true; throw new Error("must not run"); export const join = String;`,
      },
      {
        fileName: "src/orders.function.ts",
        text: `import { defineFunction } from "@relkit/functions";
          export default defineFunction({ id: "orders.create", handler: async () => ({}) });`,
      },
      {
        fileName: "src/orders.barrel.ts",
        text: `export { default } from "./orders.function.ts";`,
      },
      {
        fileName: "src/brand.ts",
        text: `const brand = Symbol.for("relkit.descriptor"); export const isDescriptor = (value: object) => value[brand];`,
      },
      {
        fileName: "src/ignored.test.ts",
        text: `import { defineFunction } from "@relkit/functions"; throw new Error("must not run"); export default defineFunction({});`,
      },
      {
        fileName: "src/a/__fixtures__/ignored.ts",
        text: `import { defineRoute } from "@relkit/routes"; throw new Error("must not run"); export default defineRoute({});`,
      },
    ]);

    expect(result.candidates.map((candidate) => candidate.fileName)).toEqual([
      "src/brand.ts",
      "src/orders.barrel.ts",
      "src/orders.function.ts",
    ]);
    const functionCandidate = result.candidates.find(
      (candidate) => candidate.fileName === "src/orders.function.ts",
    );
    expect(functionCandidate).toMatchObject({
      imports: ["@relkit/functions"],
      factories: ["defineFunction"],
      defaultExports: ["default"],
      facts: {
        factoryBindings: [
          expect.objectContaining({
            factory: "defineFunction",
            id: "explicit",
          }),
        ],
      },
      brandAccess: false,
      indicators: ["relkit-import", "factory", "default-export"],
    });
    expect(
      result.candidates.find((candidate) => candidate.fileName === "src/brand.ts"),
    ).toMatchObject({ brandAccess: true, indicators: ["brand-access"] });
    expect(
      result.candidates.find((candidate) => candidate.fileName === "src/orders.barrel.ts"),
    ).toMatchObject({
      defaultExports: ["default"],
      indicators: ["default-export", "re-export"],
      reExports: [
        { moduleSpecifier: "./orders.function.ts", names: ["default"], exportAll: false },
      ],
    });
    expect(result.skipped).toEqual([
      { fileName: "src/a/__fixtures__/ignored.ts", reason: "excluded" },
      { fileName: "src/helper.ts", reason: "no-candidate-indicator" },
      { fileName: "src/ignored.test.ts", reason: "excluded" },
    ]);
    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
  });

  test("ignores type-only RelKit references and uses default exclusions", () => {
    const result = prefilterSources([
      {
        fileName: "src/types.ts",
        text: `import type { FunctionRef } from "@relkit/functions"; export type { FunctionRef };`,
      },
      {
        fileName: "src/fixture.test.ts",
        text: `export default { shouldNotBeEvaluated: true };`,
      },
      {
        fileName: "src/__fixtures__/fixture.ts",
        text: `export default { shouldNotBeEvaluated: true };`,
      },
    ]);

    expect(result.candidates).toEqual([]);
    expect(result.skipped).toEqual([
      { fileName: "src/__fixtures__/fixture.ts", reason: "excluded" },
      { fileName: "src/fixture.test.ts", reason: "excluded" },
      { fileName: "src/types.ts", reason: "no-candidate-indicator" },
    ]);
  });
});
