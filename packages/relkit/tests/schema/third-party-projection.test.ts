/** Projects Zod 4, ArkType, Valibot and Effect Schema contracts in the input and output directions. */
import { type } from "arktype";
import { Schema } from "effect";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  getJsonSchema,
  schemaConverter,
  schemaLibraryVersion,
  type StandardSchemaV1,
} from "../../src/schema/index.js";

const input = (schema: StandardSchemaV1) => getJsonSchema(schema, { direction: "input" });
const output = (schema: StandardSchemaV1) => getJsonSchema(schema, { direction: "output" });

describe("Zod 4 uses its own ~standard.jsonSchema hook", () => {
  const order = z.object({ sku: z.string().min(1), quantity: z.number().int().default(1) });

  test("input leaves a defaulted field optional and output requires it", () => {
    expect(input(order)).toEqual({
      ok: true,
      schema: {
        properties: {
          quantity: {
            default: 1,
            maximum: 9007199254740991,
            minimum: -9007199254740991,
            type: "integer",
          },
          sku: { minLength: 1, type: "string" },
        },
        required: ["sku"],
        type: "object",
      },
    });
    expect(output(order)).toMatchObject({ ok: true, schema: { required: ["quantity", "sku"] } });
  });

  test("the dialect key is dropped and keys are sorted", () => {
    const result = input(order);
    if (!result.ok) throw new Error(result.reason);
    expect(result.schema.$schema).toBeUndefined();
    expect(Object.keys(result.schema)).toEqual([...Object.keys(result.schema)].sort());
  });
});

describe("ArkType uses its own hook", () => {
  test("projects an object", () => {
    expect(input(type({ name: "string", "age?": "number" }))).toEqual({
      ok: true,
      schema: {
        properties: { age: { type: "number" }, name: { type: "string" } },
        required: ["name"],
        type: "object",
      },
    });
  });
});

describe("Valibot uses @valibot/to-json-schema", () => {
  const order = v.object({ sku: v.pipe(v.string(), v.minLength(1)), note: v.optional(v.string()) });

  test("loads the converter on first use", () => {
    expect(order["~standard"]).not.toHaveProperty("jsonSchema");
    expect(schemaConverter(order)).toBeTypeOf("function");
  });

  test("projects both directions", () => {
    const expected = {
      ok: true,
      schema: {
        properties: { note: { type: "string" }, sku: { minLength: 1, type: "string" } },
        required: ["sku"],
        type: "object",
      },
    };
    expect(input(order)).toEqual(expected);
    expect(output(order)).toEqual(expected);
  });
});

describe("Effect Schema uses Effect's converter", () => {
  const order = Schema.toStandardSchemaV1(
    Schema.Struct({ sku: Schema.String, quantity: Schema.NumberFromString }),
  ) as unknown as StandardSchemaV1;

  test("input and output differ for a transforming field", () => {
    expect(input(order)).toMatchObject({
      ok: true,
      schema: { properties: { quantity: { type: "string" }, sku: { type: "string" } } },
    });
    expect(output(order)).toMatchObject({
      ok: true,
      schema: { properties: { quantity: { anyOf: [{ type: "number" }, expect.anything()] } } },
    });
  });
});

describe("libraries without a projection path", () => {
  const legacy: StandardSchemaV1 = {
    "~standard": { version: 1, vendor: "yup", validate: (value) => ({ value }) },
  };

  test("stay unavailable with RELKIT_SCHEMA_UNAVAILABLE", () => {
    expect(input(legacy)).toEqual({
      ok: false,
      code: "RELKIT_SCHEMA_UNAVAILABLE",
      reason: "Schema does not expose a deterministic projection",
    });
  });
});

test("projection is identical across runs", () => {
  const schemas = [
    z.object({ b: z.string(), a: z.number() }),
    type({ b: "string", a: "number" }),
    v.object({ b: v.string(), a: v.number() }),
  ];
  for (const schema of schemas)
    expect(JSON.stringify(input(schema))).toBe(JSON.stringify(input(schema)));
});

test("library versions come from the installed packages", () => {
  expect(schemaLibraryVersion("zod", process.cwd())).toMatch(/^4\./u);
  expect(schemaLibraryVersion("valibot", process.cwd())).toMatch(/^1\./u);
  expect(schemaLibraryVersion("arktype", process.cwd())).toMatch(/^2\./u);
  expect(schemaLibraryVersion("effect", process.cwd())).toMatch(/^4\./u);
  expect(schemaLibraryVersion("relkit", process.cwd())).toBeUndefined();
});
