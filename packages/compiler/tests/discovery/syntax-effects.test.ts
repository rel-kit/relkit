import { describe, expect, it } from "@effect/vitest";
import { SourceLocationError } from "@relkit/contracts";
import { Effect, Exit, Schema } from "effect";
import * as ts from "typescript";
import { prefilterSources, prefilterSourcesEffect } from "../../src/discovery/ast-prefilter.js";
import { AstPrefilterCandidate } from "../../src/discovery/ast-prefilter-schema.js";
import { scanSource, scanSourceEffect } from "../../src/discovery/ast-prefilter-utils.js";
import { readFacts, readFactsEffect } from "../../src/discovery/source-facts.js";
import { ExportFacts, FactoryBindingFact } from "../../src/discovery/source-facts-schema.js";

/**
 * Parses unevaluated TypeScript for discovery contract tests.
 * @param text - Source text to inspect.
 * @returns A source file retaining parent links and source character offsets.
 */
function parse(text: string): ts.SourceFile {
  return ts.createSourceFile("src/module.ts", text, ts.ScriptTarget.Latest, true);
}

describe("syntax discovery Effect contracts", () => {
  it.effect("keeps type-only syntax out of runtime evidence", () =>
    Effect.gen(function* () {
      const scanned = yield* scanSourceEffect(
        "src/types.ts",
        `
        import type { Service } from "@relkit/services";
        import { type Descriptor } from "@relkit/contracts";
        export type { Route } from "@relkit/routes";
        export { type Constants } from "@relkit/config";
      `,
      );
      expect(scanned.indicators).toEqual([]);
      expect(scanned.imports).toEqual([]);
      expect(scanned.reExports).toEqual([]);
      expect([...scanned.facts.exports]).toEqual([]);
    }),
  );

  it.effect("collects stable runtime indicators without evaluating source", () =>
    Effect.gen(function* () {
      const text = `
        throw new Error("must never execute");
        import "@relkit/functions";
        const load = import("@relkit/config");
        const other = require("@relkit/functions");
        const fn = namespace.defineFunction({ handler() {} });
        Symbol.for("relkit.descriptor");
        export { default, value, type Type } from "./other.js";
        export default fn;
      `;
      const scanned = yield* scanSourceEffect("src/runtime.ts", text);
      expect(scanned.imports).toEqual(["@relkit/config", "@relkit/functions"]);
      expect(scanned.factories).toEqual(["defineFunction"]);
      expect(scanned.indicators).toEqual([
        "relkit-import",
        "factory",
        "default-export",
        "brand-access",
        "re-export",
      ]);
      expect(scanned.reExports).toEqual([
        { moduleSpecifier: "./other.js", names: ["default", "value"], exportAll: false },
      ]);
      expect(Schema.is(AstPrefilterCandidate)(scanned)).toBe(true);
      expect(scanSource("src/runtime.ts", text)).toEqual(scanned);
    }),
  );

  it.effect("keeps execution-local mutable evidence independent across reuse", () =>
    Effect.gen(function* () {
      const effect = scanSourceEffect("src/module.ts", "export default defineTool({});");
      const first = yield* effect;
      const second = yield* effect;
      expect(second).toEqual(first);
      expect(second.facts.exports).not.toBe(first.facts.exports);
      expect(first.facts.factoryBindings).toHaveLength(1);
    }),
  );

  it.effect("links aliases and routes while ignoring type-only reexports", () =>
    Effect.gen(function* () {
      const source = parse(`
        const route = (defineRoute({})) satisfies unknown;
        export { route as GET, route as post };
        export { value as alias, type Shape } from "./upstream.js";
        export * from "./all.js";
      `);
      const facts = yield* readFactsEffect(source);
      expect(
        facts.routeOperations.map(({ exportName, method }) => ({ exportName, method })),
      ).toEqual([
        { exportName: "GET", method: "GET" },
        { exportName: "post", method: "POST" },
      ]);
      expect(facts.exports.get("alias")?.origin).toEqual({
        module: "./upstream.js",
        name: "value",
      });
      expect(facts.exports.has("Shape")).toBe(false);
      expect(facts.stars[0]?.module).toBe("./all.js");
      expect(Schema.is(ExportFacts)(facts)).toBe(true);
      expect(readFacts(source)).toEqual(facts);
    }),
  );

  it.effect("records service route destructuring and local service member targets", () =>
    Effect.gen(function* () {
      const facts = yield* readFactsEffect(
        parse(`
        const handler = defineFunction({});
        export const { GET, POST: create, ...rest } = defineServiceRoutes({});
        export const service = defineService({
          functions: { handler, renamed: handler, inline: defineFunction({}), ...others },
          tasks: { work: task }, unrelated: { ignored: handler }
        });
      `),
      );
      expect(facts.factoryBindings.map(({ binding }) => binding)).toEqual([
        "handler",
        "GET",
        "create",
        "service",
      ]);
      expect(
        facts.serviceMembers.map(({ member, targetBinding }) => ({ member, targetBinding })),
      ).toEqual([
        { member: "handler", targetBinding: "handler" },
        { member: "renamed", targetBinding: "handler" },
        { member: "inline", targetBinding: undefined },
        { member: "work", targetBinding: "task" },
      ]);
      expect(facts.routeOperations.map(({ exportName }) => exportName)).toEqual(["GET"]);
    }),
  );

  it.effect("retains factory-specific ID rules and shallow diagnostic paths", () =>
    Effect.gen(function* () {
      const facts = yield* readFactsEffect(
        parse(`
        export const app = defineApp({ defaults: { id: "a" }, compatibility: { alias: true }, ...base });
        const prompt = definePrompt("text", { id: "prompt" });
        const constants = defineConstants({}, {});
        const unknown = defineTask(options);
        const error = defineError({ id: "error" });
        let variableError = defineError({});
      `),
      );
      expect(facts.factoryBindings.map(({ id }) => id)).toEqual([
        "omitted",
        "explicit",
        "omitted",
        "unknown",
        "explicit",
        "omitted",
      ]);
      expect(facts.factoryBindings[0]?.optionPaths).toEqual([
        "defaults",
        "defaults.id",
        "compatibility",
        "compatibility.alias",
      ]);
      expect(facts.errorBindings.map(({ binding }) => binding)).toEqual(["error"]);
    }),
  );

  it.effect("normalizes and sorts filenames while retaining explicit skip reasons", () =>
    Effect.gen(function* () {
      const modules = [
        { fileName: "src/z.ts", text: "export default defineFunction({});" },
        { fileName: "src\\a.ts", text: "export default defineTool({});" },
        { fileName: "src/plain.ts", text: "export const number = 1;" },
      ];
      const result = yield* prefilterSourcesEffect(modules, { exclude: [] });
      expect(result.candidates.map(({ fileName }) => fileName)).toEqual(["src/a.ts", "src/z.ts"]);
      expect(result.skipped).toEqual([
        { fileName: "src/plain.ts", reason: "no-candidate-indicator" },
      ]);
      expect(prefilterSources(modules, { exclude: [] })).toEqual(result);
      expect(Object.isFrozen(result.candidates)).toBe(true);
    }),
  );

  it.effect("preserves typed path failures and the synchronous error boundary", () =>
    Effect.gen(function* () {
      const modules = [{ fileName: "", text: "export default defineFunction({});" }];
      const error = yield* Effect.flip(prefilterSourcesEffect(modules, { exclude: [] }));
      expect(error).toBeInstanceOf(SourceLocationError);
      expect(() => prefilterSources(modules, { exclude: [] })).toThrow(
        "file must be a non-empty path",
      );
    }),
  );

  it.effect("rejects invalid factory ID evidence through the schema error channel", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        Schema.decodeUnknownEffect(FactoryBindingFact)({
          factory: "defineRoute",
          kind: "route",
          idOptional: true,
          id: "invented",
          position: 0,
          options: [],
        }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );
});
