import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  getJsonSchema,
  isJsonSchemaAvailable,
  SchemaValidationError,
  validate,
  validateSync,
  z,
} from "../src/index.js";
import { createSchemaEffect, runSchemaEffect } from "../src/schema-impl.js";
import { projectJsonSchema } from "../src/schema-impl-helpers.js";
import { getMetadataProjection, isMetadataOptional } from "../src/schema-metadata.js";
import { flatMapResult, mapResult, mapValue } from "../src/schema-result.js";
import type { StandardSchemaV1 } from "../src/standard-schema.types.js";

describe("schema edge behavior", () => {
  test("checks file options, media type normalization, and wildcard matching", () => {
    expect(() => z.file({ maxBytes: 0 })).toThrow("file.maxBytes must be a positive integer");
    expect(() => z.file({ maxBytes: 1.5 })).toThrow("file.maxBytes must be a positive integer");
    expect(() => z.file({ mediaTypes: [] })).toThrow("file.mediaTypes must be a non-empty array");
    expect(() => z.file({ mediaTypes: ["wrong"] })).toThrow(
      "file.mediaTypes contains an invalid media type",
    );
    const schema = z.file({ maxBytes: 8, mediaTypes: ["IMAGE/*", "image/*"] });
    expect(z.file().safeParse("not a file")).toMatchObject({
      issues: [{ message: "Expected a file" }],
    });
    const accepted = new File(["ok"], "photo.png", { type: "image/png" });
    expect(validateSync(schema, accepted)).toEqual({ value: accepted });
    expect(getJsonSchema(schema)).toEqual({
      ok: true,
      schema: {
        format: "binary",
        type: "string",
        "x-relkit-maxBytes": 8,
        "x-relkit-mediaTypes": ["image/*"],
      },
    });
  });

  test("preserves parse errors and handles a rejected async validator", async () => {
    expect(validate(z.string(), "ready")).toEqual({ value: "ready" });
    expect(validate(z.string(), 1 as never)).toMatchObject({
      issues: [{ message: "Expected a string" }],
    });
    expect(() => validate({} as StandardSchemaV1, "value")).toThrow(
      "Value is not a Standard Schema v1 validator",
    );
    const failed = z
      .string()
      .parseAsync(1)
      .catch((error: unknown) => error);
    expect(await failed).toBeInstanceOf(SchemaValidationError);
    const rejected: StandardSchemaV1 = {
      "~standard": {
        version: 1,
        vendor: "rejecting-fixture",
        validate: () => Promise.reject(new TypeError("rejected")),
      },
    };
    await expect(validate(rejected, "x")).rejects.toThrow("rejected");
    await expect(validate(z.array(rejected), ["x"])).rejects.toThrow("rejected");
    const throwing: StandardSchemaV1 = {
      "~standard": {
        version: 1,
        vendor: "throwing-fixture",
        validate: () => {
          throw new TypeError("thrown");
        },
      },
    };
    expect(() => validateSync(throwing, "x")).toThrow("thrown");
  });

  test("supports direct Effect schema construction and nested execution", () => {
    const schema = Effect.runSync(
      createSchemaEffect<unknown, number>((value, path) =>
        typeof value === "number" ? { value } : { issues: [{ message: "number", path }] },
      ),
    );
    expect(Effect.runSync(runSchemaEffect(schema, 3, ["count"]))).toEqual({ value: 3 });
    expect(Effect.runSync(runSchemaEffect(schema, "bad", ["count"]))).toEqual({
      issues: [{ message: "number", path: ["count"] }],
    });
    expect(schema.safeParse("bad")).toEqual({ issues: [{ message: "number", path: [] }] });
  });

  test("validates Standard JSON Schema targets and metadata fallbacks", () => {
    const schema = z.string();
    expect(schema["~standard"].jsonSchema.input({ target: "draft-07" })).toEqual({
      type: "string",
    });
    expect(() => schema["~standard"].jsonSchema.input({ target: "wrong" })).toThrow(
      'Unsupported JSON Schema target "wrong"',
    );
    expect(() => projectJsonSchema({}, "output", "draft-2020-12")).toThrow(
      "Schema does not expose a deterministic JSON Schema projection",
    );
    expect(getMetadataProjection({ jsonSchema: () => ({ type: "string" }) }, "input")?.()).toEqual({
      type: "string",
    });
    expect(isMetadataOptional({ optional: true }, "output")).toBe(true);
    expect(isMetadataOptional(undefined, "input")).toBe(false);
    expect(isJsonSchemaAvailable(getJsonSchema(schema))).toBe(true);
    expect(isJsonSchemaAvailable(getJsonSchema(z.string().transform(Number)))).toBe(false);
  });

  test("composes synchronous and asynchronous result helpers", async () => {
    expect(mapResult({ value: 1 }, (result) => ("value" in result ? result.value + 1 : 0))).toBe(2);
    expect(
      await mapResult(Promise.resolve({ value: 1 }), (result) =>
        "value" in result ? result.value + 1 : 0,
      ),
    ).toBe(2);
    expect(flatMapResult({ issues: [{ message: "bad" }] }, () => ({ value: 2 }))).toEqual({
      issues: [{ message: "bad" }],
    });
    expect(
      await flatMapResult(Promise.resolve({ value: 1 }), (value) => ({ value: value + 1 })),
    ).toEqual({ value: 2 });
    expect(mapValue(1, (value) => value + 1)).toBe(2);
    expect(await mapValue(Promise.resolve(1), (value) => value + 1)).toBe(2);
  });
});
