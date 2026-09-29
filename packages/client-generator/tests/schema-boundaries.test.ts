import { expect, test } from "vitest";
import { Effect } from "effect";
import { graph } from "./fixtures/generator-graphs.js";
import { clientRoutes } from "../src/generate-types.js";
import { responseSchemaEffect, schemaAtEffect, schemaTypeEffect } from "../src/generate-schema.js";

test("renders empty unions, malformed fields, and scalar schema boundaries", () => {
  const cases: readonly [unknown, string][] = [
    [{ enum: [] }, "unknown"],
    [{ oneOf: [] }, "unknown"],
    [{ const: undefined }, "unknown"],
    [{ const: Symbol("unsupported") }, "unknown"],
    [{ type: "integer" }, "number"],
    [{ type: "null" }, "null"],
    [{ type: "unsupported" }, "unknown"],
    [{ type: "object", properties: null }, "Record<string, unknown>"],
    [{ properties: { optional: { type: "string" } } }, '{ "optional"?: string }'],
    [{ type: "array" }, "readonly unknown[]"],
    [{ $relkit: "schema", jsonSchema: null }, "unknown"],
  ];
  for (const [input, expected] of cases) {
    expect(Effect.runSync(schemaTypeEffect(input))).toBe(expected);
  }
  expect(Effect.runSync(schemaAtEffect({ type: "string" }, ["missing"]))).toBeUndefined();
  expect(Effect.runSync(schemaAtEffect(null, []))).toBeUndefined();
});

test("keeps declared and undeclared HTTP error envelopes distinct", () => {
  const route = clientRoutes(graph(false))[0]!;
  const declared = Effect.runSync(
    responseSchemaEffect(route, {
      id: "error.orders.not-found.404",
      errorId: "orders.not-found",
      kind: "error",
      status: 404,
    }),
  );
  expect(declared).toMatchObject({
    properties: {
      code: { const: "orders.not-found" },
      status: { const: 404 },
      retry: { const: "never" },
    },
  });
  const withoutDeclarations = { ...route, target: { ...route.target, errors: [] } };
  const unknown = Effect.runSync(
    responseSchemaEffect(withoutDeclarations, { id: "unknown", kind: "error", status: 500 }),
  );
  expect(unknown).toMatchObject({
    required: ["kind", "outcome", "code", "message", "retry"],
    properties: { retry: { enum: ["never", "later"] } },
  });
  const override = Effect.runSync(
    responseSchemaEffect(withoutDeclarations, {
      id: "unknown",
      kind: "error",
      status: 500,
      schema: { type: "boolean" },
    }),
  );
  expect(override).toMatchObject({ properties: { data: { type: "boolean" } } });
  const malformed = { ...route, target: { ...route.target, errors: undefined } };
  expect(
    Effect.runSync(responseSchemaEffect(malformed, { id: "unknown", kind: "error", status: 500 })),
  ).toMatchObject({ properties: { code: { const: "unknown" } } });
  const mixed = { ...route, target: { ...route.target, errors: [null, { id: "other" }] } };
  expect(
    Effect.runSync(responseSchemaEffect(mixed, { id: "other", kind: "error", status: 500 })),
  ).toMatchObject({ properties: { code: { const: "other" } } });
});
