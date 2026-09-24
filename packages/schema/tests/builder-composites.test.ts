import { describe, expect, test } from "vitest";
import { getJsonSchema, validate, validateSync, z } from "../src/index.js";

describe("composite schema builders", () => {
  test("validates arrays, objects, and unions at their boundaries", () => {
    expect(z.object({ name: z.string() }).safeParse([])).toMatchObject({
      issues: [{ message: "Expected an object" }],
    });
    expect(z.array(z.number()).safeParse({})).toMatchObject({
      issues: [{ message: "Expected an array" }],
    });
    expect(z.array(z.number()).parse([1, 2])).toEqual([1, 2]);
    expect(z.union([z.literal("one"), z.number()]).parse(2)).toBe(2);
    expect(z.union([z.literal("one"), z.number()]).safeParse(false)).toMatchObject({
      issues: [{ message: "Value did not match any union member" }],
    });
    expect(z.object({ optional: z.string().optional() }).parse({})).toEqual({});
    expect(z.object({ optional: z.string().optional() }).parse({ optional: undefined })).toEqual({
      optional: undefined,
    });
  });

  test("preserves ordered asynchronous child issues and outputs", async () => {
    const schema = z.object({
      first: z.string().refine(async (value) => value === "yes", "first invalid"),
      second: z.string().refine(async (value) => value === "yes", "second invalid"),
    });
    expect(await validate(schema, { first: "no", second: "no" })).toEqual({
      issues: [
        { message: "first invalid", path: ["first"] },
        { message: "second invalid", path: ["second"] },
      ],
    });
    expect(await validate(schema, { first: "yes", second: "yes" })).toEqual({
      value: { first: "yes", second: "yes" },
    });
    expect(
      await validate(z.array(z.number().transform(async (value) => value * 2)), [1, 2]),
    ).toEqual({
      value: [2, 4],
    });
    expect(
      await validate(
        z.union([
          z.string().refine(async () => false),
          z.number().transform(async (value) => value + 1),
        ]),
        1,
      ),
    ).toEqual({ value: 2 });
  });

  test("projects complete compositions and reports missing directions", () => {
    const schema = z.object({
      names: z.array(z.string().min(1)),
      choice: z.union([z.literal("a"), z.literal("b")]),
      maybe: z.number().optional(),
    });
    expect(getJsonSchema(schema)).toEqual({
      ok: true,
      schema: {
        properties: {
          choice: { anyOf: [{ const: "a" }, { const: "b" }] },
          maybe: { type: "number" },
          names: { items: { minLength: 1, type: "string" }, type: "array" },
        },
        required: ["choice", "names"],
        type: "object",
      },
    });
    expect(getJsonSchema(z.array(z.string().transform(Number)))).toMatchObject({ ok: false });
    expect(getJsonSchema(z.union([z.string(), z.string().transform(Number)]))).toMatchObject({
      ok: false,
    });
    expect(getJsonSchema(z.object({ transformed: z.string().transform(Number) }))).toMatchObject({
      ok: false,
    });
    expect(validateSync(schema, { names: [""], choice: "c" as never })).toEqual({
      issues: [
        { message: "Must contain at least 1 characters", path: ["names", 0] },
        { message: "Value did not match any union member", path: ["choice"] },
      ],
    });
  });

  test("projects array and union members in both directions", () => {
    const array = z.array(z.string().default("ready"));
    expect(getJsonSchema(array, { direction: "input" })).toEqual({
      ok: true,
      schema: { type: "array", items: { type: "string" } },
    });
    expect(getJsonSchema(array, { direction: "output" })).toEqual({
      ok: true,
      schema: { type: "array", items: { default: "ready", type: "string" } },
    });
    const union = z.union([z.string(), z.number()]);
    expect(getJsonSchema(union, { direction: "input" })).toEqual({
      ok: true,
      schema: { anyOf: [{ type: "string" }, { type: "number" }] },
    });
    expect(getJsonSchema(union, { direction: "output" })).toEqual({
      ok: true,
      schema: { anyOf: [{ type: "string" }, { type: "number" }] },
    });
  });
});
