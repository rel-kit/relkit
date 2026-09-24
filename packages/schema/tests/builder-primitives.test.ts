import { describe, expect, test } from "vitest";
import { getJsonSchema, SchemaValidationError, validateSync, z } from "../src/index.js";

describe("primitive schema builders", () => {
  test("covers each primitive builder and literal boundary", () => {
    expect(z.boolean().parse(true)).toBe(true);
    expect(z.boolean().safeParse("true")).toMatchObject({
      issues: [{ message: "Expected boolean" }],
    });
    expect(z.unknown().parse({ a: 1 })).toEqual({ a: 1 });
    expect(z.any().parse(null)).toBeNull();
    expect(getJsonSchema(z.unknown())).toEqual({ ok: true, schema: {} });
    expect(getJsonSchema(z.any())).toEqual({ ok: true, schema: {} });
    expect(getJsonSchema(z.boolean())).toEqual({ ok: true, schema: { type: "boolean" } });
    expect(z.null().parse(null)).toBeNull();
    expect(z.null().safeParse(undefined)).toMatchObject({ issues: [{ message: "Expected null" }] });
    expect(z.undefined().parse(undefined)).toBeUndefined();
    expect(z.void().safeParse(1)).toMatchObject({ issues: [{ message: "Expected undefined" }] });
    expect(z.literal("ready").parse("ready")).toBe("ready");
    expect(z.literal(0).safeParse(-0)).toMatchObject({ issues: [{ message: "Expected 0" }] });
    expect(getJsonSchema(z.literal(undefined))).toEqual({
      ok: true,
      schema: { "x-relkit-void": true },
    });
    expect(getJsonSchema(z.literal(true))).toEqual({ ok: true, schema: { const: true } });
  });

  test("applies string refinements and directional projections", () => {
    const schema = z.string().min(2).max(4).email();
    expect(schema.safeParse("a")).toMatchObject({
      issues: [{ message: "Must contain at least 2 characters" }],
    });
    expect(schema.safeParse("abcde")).toMatchObject({
      issues: [{ message: "Must contain at most 4 characters" }],
    });
    expect(z.string().email().safeParse("bad")).toMatchObject({
      issues: [{ message: "Expected an email address" }],
    });
    expect(z.string().uuid().parse("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(z.string().uuid().safeParse("bad")).toMatchObject({
      issues: [{ message: "Expected a UUID" }],
    });
    expect(z.string().datetime().parse("2026-09-23T00:00:00Z")).toBe("2026-09-23T00:00:00Z");
    expect(z.string().datetime().safeParse("bad")).toMatchObject({
      issues: [{ message: "Expected an ISO datetime" }],
    });
    expect(getJsonSchema(z.string().min(2).max(4))).toEqual({
      ok: true,
      schema: { maxLength: 4, minLength: 2, type: "string" },
    });
  });

  test("applies number refinements and rejects non-finite values", () => {
    expect(z.number().safeParse(Infinity)).toMatchObject({
      issues: [{ message: "Expected a finite number" }],
    });
    expect(z.number().min(2).safeParse(1)).toMatchObject({
      issues: [{ message: "Must be at least 2" }],
    });
    expect(z.number().max(2).safeParse(3)).toMatchObject({
      issues: [{ message: "Must be at most 2" }],
    });
    expect(z.number().int().safeParse(1.5)).toMatchObject({
      issues: [{ message: "Expected an integer" }],
    });
    expect(z.number().positive().safeParse(0)).toMatchObject({
      issues: [{ message: "Expected a positive number" }],
    });
    expect(z.number().nonnegative().safeParse(-1)).toMatchObject({
      issues: [{ message: "Expected a nonnegative number" }],
    });
    expect(z.number().min(0).max(2).int().positive().parse(1)).toBe(1);
    expect(getJsonSchema(z.number().int().positive())).toEqual({
      ok: true,
      schema: { exclusiveMinimum: 0, type: "integer" },
    });
  });

  test("keeps parsing and refinement compatibility", async () => {
    const schema = z.string().optional().nullable().default("fallback");
    expect(schema.parse(undefined)).toBe("fallback");
    expect(schema.parse(null)).toBeNull();
    expect(schema.safeParse(1)).toMatchObject({ issues: [{ message: "Expected a string" }] });
    expect(() => z.string().parse(1)).toThrow(SchemaValidationError);
    expect(
      await z
        .string()
        .transform(async (value) => value.toUpperCase())
        .parseAsync("ok"),
    ).toBe("OK");
    expect(
      await z
        .number()
        .refine(async (value) => value > 0)
        .safeParse(0),
    ).toMatchObject({
      issues: [{ message: "Invalid value" }],
    });
    expect(
      validateSync(
        z.string().refine((value) => value !== "bad", "custom"),
        "bad",
      ),
    ).toMatchObject({
      issues: [{ message: "custom" }],
    });
    expect(() =>
      z
        .string()
        .transform(async (value) => value)
        .parse("ok"),
    ).toThrow("Schema validation is asynchronous");
  });
});
