import { describe, expect, test } from "vitest";
import { Effect, Exit, Layer } from "effect";
import { graph } from "./fixtures/generator-graphs.js";
import { GeneratorTelemetry } from "../src/generator-observability.js";
import { collectMappingsEffect, responseContractsEffect } from "../src/generate-mappings.js";
import { schemaAtEffect, schemaTypeEffect, responseSchemaEffect } from "../src/generate-schema.js";
import { addInputFieldEffect, renderInputTreeEffect } from "../src/input-tree.js";
import { routeParametersEffect } from "../src/route-parameters.js";
import { makeGeneratorOperationEffect } from "../src/generator-operation.js";
import { makeGraphOperationEffect } from "../src/generator-graph-operation.js";
import {
  clientRoutes,
  clientRoutesEffect,
  mappedInputTypeEffect,
  MissingRouteTarget,
  responseTypeEffect,
} from "../src/generate-types.js";
describe("Effect generator operations", () => {
  test("Effect factories preserve their named operation and synchronous adapter", () => {
    const text = Effect.runSync(
      makeGeneratorOperationEffect("testRender", (value: string) =>
        Effect.succeed(value.toUpperCase()),
      ),
    );
    expect(Effect.runSync(text.effect("ready"))).toBe("READY");
    expect(text.run("ready")).toBe("READY");
    const routes = Effect.runSync(
      makeGraphOperationEffect("testRoutes", (_graph, publicRoutes) =>
        Effect.succeed(publicRoutes.length),
      ),
    );
    expect(Effect.runSync(routes.effect(graph(false)))).toBe(1);
    expect(routes.run(graph(false))).toBe(1);
  });
  test("decodes schema types and nested property paths", () => {
    const cases: readonly [unknown, string][] = [
      [undefined, "unknown"],
      [{ const: "ready" }, '"ready"'],
      [{ enum: ["a", "b"] }, '"a" | "b"'],
      [{ oneOf: [{ type: "string" }, { type: "null" }] }, "string | null"],
      [{ anyOf: [{ type: "number" }, { type: "boolean" }] }, "number | boolean"],
      [{ type: "array", items: { type: "integer" } }, "readonly number[]"],
      [{ type: "object", properties: {} }, "Record<string, unknown>"],
      [{ type: "boolean" }, "boolean"],
    ];
    for (const [schema, expected] of cases)
      expect(Effect.runSync(schemaTypeEffect(schema))).toBe(expected);
    const wrapped = {
      $relkit: "schema",
      jsonSchema: { type: "object", properties: { nested: { type: "string" } } },
    };
    expect(Effect.runSync(schemaAtEffect(wrapped, ["nested"]))).toEqual({ type: "string" });
    expect(Effect.runSync(schemaAtEffect(wrapped, ["missing", "child"]))).toBeUndefined();
  });
  test("assembles mapped inputs and response types", () => {
    const route = clientRoutes(graph(false))[0]!;
    expect(Effect.runSync(mappedInputTypeEffect(route))).toContain('"tag"?: string');
    const success = route.responses.find((response) => response.kind === "success")!;
    const validation = route.responses.find((response) => response.kind === "validation-error")!;
    expect(Effect.runSync(responseTypeEffect(route, success))).toContain('"totalCents": number');
    expect(Effect.runSync(responseSchemaEffect(route, validation))).toMatchObject({
      properties: { error: { const: "validation" } },
    });
    expect(Effect.runSync(responseTypeEffect(route, validation))).toContain(
      '"error": "validation"',
    );
    expect(
      Effect.runSync(responseSchemaEffect(route, { id: "rate", kind: "error", status: 429 })),
    ).toMatchObject({ properties: { error: { const: "rate-limit" } } });
    expect(
      Effect.runSync(responseSchemaEffect(route, { id: "other", kind: "redirect", status: 302 })),
    ).toBeUndefined();
    expect(
      Effect.runSync(
        mappedInputTypeEffect({
          ...route,
          fields: [
            {
              inputPath: [],
              outputPath: [],
              kind: "whole-body",
              optional: false,
              defaulted: false,
            },
          ],
        }),
      ),
    ).toContain('"id": string');
    const inferred = {
      ...route,
      fields: [
        {
          inputPath: ["missing"],
          outputPath: ["missing"],
          kind: "query",
          name: "missing",
          optional: false,
          defaulted: false,
        },
      ],
    };
    expect(Effect.runSync(mappedInputTypeEffect(inferred))).toContain('"missing": string');
    expect(
      Effect.runSync(
        mappedInputTypeEffect({
          ...route,
          fields: [
            {
              inputPath: [],
              outputPath: [],
              kind: "constant",
              value: 1,
              optional: false,
              defaulted: false,
            },
          ],
        }),
      ),
    ).toBe('{ "id": string }');
  });
  test("parses route parameters and builds nested input trees", () => {
    expect(Effect.runSync(routeParametersEffect("/a/:id/*parts?/plain"))).toEqual([
      { segment: ":id", name: "id", kind: "path", optional: false },
      { segment: "*parts?", name: "parts", kind: "path-segments", optional: true },
    ]);
    const tree = { fields: new Map() };
    Effect.runSync(addInputFieldEffect(tree, ["customer", "id"], "string", { optional: false }));
    Effect.runSync(addInputFieldEffect(tree, ["customer", "label"], "string", { optional: true }));
    Effect.runSync(addInputFieldEffect(tree, [], "ignored", { optional: false }));
    expect(Effect.runSync(renderInputTreeEffect(tree))).toBe(
      '{ "customer": { "id": string; "label"?: string } }',
    );
    expect(Effect.runSync(renderInputTreeEffect({ fields: new Map() }))).toBe("{}");
  });
  test("collects mapping leaves and adds a default validation response", () => {
    const mapping = {
      kind: "input",
      fields: {
        id: { kind: "path", name: "id" },
        payload: { kind: "default", value: { kind: "body", name: "payload" } },
        ignored: null,
      },
    };
    const leaves = Effect.runSync(collectMappingsEffect(mapping));
    expect(leaves.map((leaf) => leaf.kind)).toEqual(["path", "body"]);
    expect(leaves[1]?.defaulted).toBe(true);
    expect(
      Effect.runSync(
        responseContractsEffect([{ id: "success.200", kind: "success", status: 200 }]),
      ),
    ).toEqual([
      { id: "success.200", kind: "success", status: 200 },
      { id: "validation.422", kind: "validation-error", status: 422 },
    ]);
  });
  test("reports missing targets as typed Effect failures and preserves the adapter error", () => {
    const base = graph(false);
    const broken = { ...base, nodes: base.nodes.filter((node) => node.kind !== "function") };
    const observed: string[] = [];
    const telemetry = Layer.succeed(GeneratorTelemetry, {
      observe: (operation, effect) =>
        Effect.onExit(effect, (exit) =>
          Effect.sync(() => {
            observed.push(`${operation}:${Exit.isSuccess(exit) ? "success" : "failure"}`);
          }),
        ),
    });
    expect(Effect.runSync(Effect.provide(clientRoutesEffect(base), telemetry))).toHaveLength(1);
    const failure = Effect.runSync(
      Effect.provide(Effect.flip(clientRoutesEffect(broken)), telemetry),
    );
    expect(failure).toBeInstanceOf(MissingRouteTarget);
    expect(failure.triggerId).toBe("orders.get");
    expect(observed).toEqual(["clientRoutes:success", "clientRoutes:failure"]);
    expect(() => clientRoutes(broken)).toThrowError(
      'HTTP trigger "orders.get" targets missing function "orders.get".',
    );
    const sentinel = new Error("graph access failed");
    const defective = {
      ...base,
      get nodes() {
        throw sentinel;
      },
    };
    expect(() => clientRoutes(defective)).toThrow(sentinel);
  });
});
