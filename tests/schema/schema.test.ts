import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getJsonSchema,
  JSON_SCHEMA_UNAVAILABLE,
  validate,
  validateSync,
  z,
} from "../../packages/schema/src/index.ts";
import { thirdPartyProduct } from "./fixtures/third-party.ts";
import { unavailableJsonSchema } from "./fixtures/unavailable-json-schema.ts";

const orderSchema = z.object({
  orderId: z.string().uuid(),
  quantity: z.number().int().positive(),
  status: z.string().default("pending"),
  tags: z.array(z.string().min(1)).optional(),
});

function readGolden(name: string): unknown {
  return JSON.parse(readFileSync(join(import.meta.dir, "golden", name), "utf8"));
}

describe.serial("@zsys/schema", () => {
  test("validates sync and async Standard Schema values", async () => {
    const defaulted = validateSync(orderSchema, {
      orderId: "550e8400-e29b-41d4-a716-446655440000",
      quantity: 2,
    });
    const asyncSchema = z.string().transform(async (value) => value.trim());
    const asyncResult = await validate(asyncSchema, "  hello ");

    expect(defaulted).toEqual({
      value: {
        orderId: "550e8400-e29b-41d4-a716-446655440000",
        quantity: 2,
        status: "pending",
      },
    });
    expect(asyncResult).toEqual({ value: "hello" });
    expect(() => validateSync(asyncSchema, "  hello ")).toThrow(
      "Schema validation is asynchronous",
    );
  });

  test("applies v3-style defaults and transforms", async () => {
    const total = z
      .number()
      .nonnegative()
      .transform((value) => value.toFixed(2));
    const result = await total.parseAsync(12.5);

    expect(result).toBe("12.50");
    expect(getJsonSchema(total)).toEqual({
      ok: false,
      code: JSON_SCHEMA_UNAVAILABLE,
      reason: "Schema does not expose a deterministic projection",
    });
  });

  test("preserves nested object and array issue paths", () => {
    const schema = z.object({
      profile: z.object({ email: z.string().email() }),
      lines: z.array(z.object({ quantity: z.number().positive() })),
    });
    const result = validateSync(schema, {
      profile: { email: "invalid" },
      lines: [{ quantity: 0 }],
    });

    expect(result).toEqual({
      issues: [
        { message: "Expected an email address", path: ["profile", "email"] },
        { message: "Expected a positive number", path: ["lines", 0, "quantity"] },
      ],
    });
  });

  test("accepts a third-party Standard Schema fixture and prefixes its issues", () => {
    const schema = z.object({ product: thirdPartyProduct });
    const invalid = validateSync(schema, { product: { name: 42 } });
    const valid = validateSync(schema, { product: { name: "  mug " } });

    expect(invalid).toEqual({
      issues: [{ message: "Expected a product name", path: ["product", "name"] }],
    });
    expect(valid).toEqual({ value: { product: { name: "mug" } } });
  });

  test("returns the unavailable result for a compatible schema without projection", () => {
    expect(getJsonSchema(unavailableJsonSchema)).toEqual({
      ok: false,
      code: JSON_SCHEMA_UNAVAILABLE,
      reason: "Schema does not expose a deterministic projection",
    });
  });

  test("keeps validation and JSON Schema goldens stable", async () => {
    const nestedIssues = validateSync(
      z.object({
        profile: z.object({ email: z.string().email() }),
        lines: z.array(z.object({ quantity: z.number().positive() })),
      }),
      { profile: { email: "invalid" }, lines: [{ quantity: 0 }] },
    );
    const thirdPartyIssues = validateSync(z.object({ product: thirdPartyProduct }), {
      product: { name: 42 },
    });
    const asyncResult = await validate(
      z.string().transform(async (value) => value.trim()),
      "  hello ",
    );
    const transformed = await z
      .number()
      .nonnegative()
      .transform((value) => value.toFixed(2))
      .parseAsync(12.5);
    const validation = {
      async: asyncResult,
      defaulted: validateSync(orderSchema, {
        orderId: "550e8400-e29b-41d4-a716-446655440000",
        quantity: 2,
      }),
      nestedIssues,
      thirdPartyIssues,
      transformed: { value: transformed },
    };
    const jsonSchema = {
      builtIn: getJsonSchema(orderSchema),
      thirdParty: getJsonSchema(thirdPartyProduct),
    };

    expect(JSON.stringify(validation)).toBe(JSON.stringify(readGolden("validation.json")));
    expect(JSON.stringify(jsonSchema)).toBe(JSON.stringify(readGolden("json-schema.json")));
  });
});
