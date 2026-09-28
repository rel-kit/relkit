import { expect, test } from "vitest";
import { Effect, Metric } from "effect";
import {
  clientSchemaMetadata,
  clientSchemaMetadataEffect,
  dynamicClientSchema,
  mergeClientSchemas,
  mergeClientSchemasEffect,
  selectedClientFields,
  selectedClientFieldsEffect,
} from "../src/client-contract-schema.ts";

const document = {
  type: "object",
  properties: {
    required: { type: "string" },
    defaulted: { type: "string", default: "value" },
  },
  required: ["required"],
} as const;

test("projects and merges client schemas through Effect and synchronous adapters", () => {
  const result = Effect.runSync(
    Effect.gen(function* () {
      const before = yield* Metric.snapshot;
      const metadata = yield* clientSchemaMetadataEffect(document);
      const merged = yield* mergeClientSchemasEffect([metadata, { kind: "dynamic" }]);
      const fields = yield* selectedClientFieldsEffect(metadata, [
        "required",
        "defaulted",
        "missing",
      ]);
      const after = yield* Metric.snapshot;
      return { metadata, merged, fields, before, after };
    }),
  );

  expect(result.metadata).toBe(document);
  expect(result.merged).toMatchObject({
    type: "object",
    required: ["required"],
    properties: document.properties,
  });
  expect(result.fields).toEqual([
    { name: "required", schema: document.properties.required },
    { name: "defaulted", schema: document.properties.defaulted },
    { name: "missing", schema: dynamicClientSchema, optional: true },
  ]);
  expect(Object.isFrozen(result.fields)).toBe(true);
  expect(clientSchemaMetadata(document)).toBe(document);
  expect(mergeClientSchemas([document])).toEqual(result.merged);
  expect(selectedClientFields(document, ["required"])).toEqual([result.fields[0]]);
  for (const [name, expected] of [
    ["relkit.agents.client_schema.merge.total", 1],
    ["relkit.agents.client_schema.select.total", 1],
    ["relkit.agents.client_schema.project.total", 3],
  ] as const) {
    expect(metricCount(result.after, name) - metricCount(result.before, name)).toBe(expected);
  }
});

test("maps malformed or cyclic schema input to dynamic metadata", () => {
  const cyclic: { type: string; self?: unknown } = { type: "object" };
  cyclic.self = cyclic;
  expect(Effect.runSync(clientSchemaMetadataEffect(cyclic))).toBe(dynamicClientSchema);
  expect(Effect.runSync(selectedClientFieldsEffect(dynamicClientSchema, ["name"]))).toEqual([]);
});

test("accepts numeric JSON fields and supplies absent object fields", () => {
  const numeric = { type: "number", minimum: 0 } as const;
  expect(clientSchemaMetadata(numeric)).toBe(numeric);
  expect(mergeClientSchemas([{ type: "object" }])).toEqual({
    type: "object",
    properties: {},
    required: [],
  });
});

function metricCount(snapshot: Metric.Snapshot[], name: string): number {
  const state = snapshot.find((metric) => metric.id === name)?.state;
  return state !== undefined && "count" in state && typeof state.count === "number"
    ? state.count
    : 0;
}
