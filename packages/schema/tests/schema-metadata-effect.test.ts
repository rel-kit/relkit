import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { getJsonSchema, z } from "../src/index.js";
import {
  getMetadataProjectionEffect,
  getSchemaMetadataEffect,
  isMetadataOptionalEffect,
  isSchemaTransformedEffect,
  isSchemaTransformed,
  SchemaMetadataError,
  setSchemaMetadata,
  setSchemaMetadataEffect,
} from "../src/schema-metadata.js";
import {
  withDefaultMetadataEffect,
  withNullableMetadataEffect,
  withOptionalMetadataEffect,
  withRefinementMetadataEffect,
  withTransformMetadataEffect,
} from "../src/schema-metadata-composition.js";
import type { StandardSchemaV1 } from "../src/standard-schema.types.js";

describe("Effect schema metadata", () => {
  test("reads and composes metadata without evaluating lazy defaults", () => {
    const schema = z.string();
    expect(Effect.runSync(getSchemaMetadataEffect(schema))?.jsonSchema?.()).toEqual({
      type: "string",
    });
    expect(Effect.runSync(getMetadataProjectionEffect(undefined))).toBeUndefined();
    expect(
      Effect.runSync(
        getMetadataProjectionEffect({ inputJsonSchema: () => ({ type: "number" }) }, "input"),
      )?.(),
    ).toEqual({ type: "number" });
    expect(Effect.runSync(isMetadataOptionalEffect({ optional: true }, "legacy"))).toBe(true);
    expect(
      Effect.runSync(isMetadataOptionalEffect({ inputOptional: false, optional: true }, "input")),
    ).toBe(false);
    expect(Effect.runSync(isSchemaTransformedEffect(schema))).toBe(false);
    expect(isSchemaTransformed(z.string().transform(Number))).toBe(true);
    expect(Effect.runSync(withRefinementMetadataEffect(schema)).refined).toBe(true);
    expect(Effect.runSync(withOptionalMetadataEffect(schema)).outputOptional).toBe(true);
    expect(Effect.runSync(withNullableMetadataEffect(schema)).jsonSchema?.()).toEqual({
      anyOf: [{ type: "string" }, { type: "null" }],
    });
    expect(Effect.runSync(withTransformMetadataEffect(schema)).inputJsonSchema?.()).toEqual({
      type: "string",
    });
    let calls = 0;
    const metadata = Effect.runSync(
      withDefaultMetadataEffect(schema, () => {
        calls += 1;
        return "ready";
      }),
    );
    expect(metadata.outputOptional).toBe(false);
    expect(calls).toBe(0);
  });

  test("attaches metadata across compatible schemas with typed failures", () => {
    const schema: StandardSchemaV1 = {
      "~standard": { version: 1, vendor: "fixture", validate: (value) => ({ value }) },
    };
    Effect.runSync(setSchemaMetadataEffect(schema, { jsonSchema: () => ({ type: "string" }) }));
    expect(getJsonSchema(schema)).toEqual({ ok: true, schema: { type: "string" } });
    const frozen = Object.freeze({ ...schema });
    const failure = Effect.runSync(
      setSchemaMetadataEffect(frozen, {}).pipe(
        Effect.catchTag("SchemaMetadataError", (error) => Effect.succeed(error)),
      ),
    );
    expect(failure).toBeInstanceOf(SchemaMetadataError);
    expect(() => setSchemaMetadata(frozen, {})).toThrow(TypeError);
  });

  test("reports a projection hook that returns a non-object value", () => {
    const defaulted = z.string();
    setSchemaMetadata(defaulted, { jsonSchema: () => null });
    expect(getJsonSchema(defaulted.default("ready"))).toMatchObject({
      ok: false,
      reason: "Schema projection must be an object",
    });
  });
});
