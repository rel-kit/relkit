import { expect, test } from "bun:test";
import { getJsonSchema, z } from "./src/index.ts";
import { getSchemaMetadata } from "./src/schema-metadata.ts";

test("projects transformed schemas by input/output direction", () => {
  const refined = z.string().min(1);
  const transformed = refined.transform(Number);
  expect(getSchemaMetadata(refined)).toMatchObject({ refined: true });
  expect(getSchemaMetadata(transformed)).toMatchObject({ refined: true, transformed: true });
  expect(getJsonSchema(transformed)).toEqual({
    ok: false,
    code: "RELKIT_SCHEMA_UNAVAILABLE",
    reason: "Schema does not expose a deterministic projection",
  });
  expect(getJsonSchema(transformed, { direction: "input" })).toEqual({
    ok: true,
    schema: { minLength: 1, type: "string" },
  });
  expect(getJsonSchema(transformed, { direction: "output" })).toEqual({
    ok: false,
    code: "RELKIT_SCHEMA_UNAVAILABLE",
    reason: "Schema does not expose a deterministic JSON Schema projection",
  });
});

test("preserves nested default and transform provenance without calling defaults", () => {
  let calls = 0;
  const schema = z.object({
    id: z.string().transform(Number),
    status: z.string().default(() => {
      calls += 1;
      return "ready";
    }),
  });

  expect(getJsonSchema(schema, { direction: "input" })).toEqual({
    ok: true,
    schema: {
      properties: { id: { type: "string" }, status: { type: "string" } },
      required: ["id"],
      type: "object",
    },
  });
  expect(getJsonSchema(schema, { direction: "output" })).toEqual({
    ok: false,
    code: "RELKIT_SCHEMA_UNAVAILABLE",
    reason: "Schema does not expose a deterministic JSON Schema projection",
  });
  expect(calls).toBe(0);
});
