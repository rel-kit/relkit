import { describe, expect, test } from "bun:test";
import { validateAgainstSchema } from "./schema-validate";

const order = {
  type: "object",
  properties: {
    orderId: { type: "string", minLength: 3 },
    quantity: { type: "integer", minimum: 1, maximum: 10 },
    status: { enum: ["open", "closed"] },
    lines: {
      type: "array",
      items: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] },
    },
    note: { type: ["string", "null"] },
  },
  required: ["orderId", "quantity"],
  additionalProperties: false,
};

describe("checking a payload against a declared schema before sending", () => {
  test("accepts a valid payload", () => {
    expect(
      validateAgainstSchema(order, {
        orderId: "o-1",
        quantity: 2,
        status: "open",
        lines: [{ sku: "a" }],
        note: null,
      }),
    ).toEqual([]);
  });

  test("names each missing required field", () => {
    expect(validateAgainstSchema(order, {})).toEqual([
      { path: "orderId", code: "missing" },
      { path: "quantity", code: "missing" },
    ]);
  });

  test("names a wrong type by dotted path, including inside arrays", () => {
    expect(
      validateAgainstSchema(order, {
        orderId: 5,
        quantity: 1.5,
        lines: [{ sku: "a" }, { sku: 3 }, {}],
      }),
    ).toEqual([
      { path: "orderId", code: "invalid_type" },
      { path: "quantity", code: "invalid_type" },
      { path: "lines.1.sku", code: "invalid_type" },
      { path: "lines.2.sku", code: "missing" },
    ]);
  });

  test("reports limits, allowed values and unknown fields", () => {
    expect(
      validateAgainstSchema(order, { orderId: "ab", quantity: 11, status: "shipped", extra: 1 }),
    ).toEqual([
      { path: "orderId", code: "too_small" },
      { path: "quantity", code: "too_big" },
      { path: "status", code: "invalid_enum_value" },
      { path: "extra", code: "unrecognized_keys" },
    ]);
  });

  test("accepts any branch of a union and reports none matching", () => {
    const union = { anyOf: [{ type: "string" }, { type: "number" }] };
    expect(validateAgainstSchema(union, 1)).toEqual([]);
    expect(validateAgainstSchema(union, true)).toEqual([{ path: "", code: "invalid_union" }]);
  });

  test("reads the input side of a schema node and ignores a schema it cannot read", () => {
    const node = {
      $relkit: "schema",
      jsonSchema: { type: "object", required: ["a"], properties: { a: { type: "string" } } },
      inputJsonSchema: { type: "object", properties: { a: { type: "string" } } },
    };
    expect(validateAgainstSchema(node, {})).toEqual([]);
    expect(validateAgainstSchema(undefined, 5)).toEqual([]);
    expect(validateAgainstSchema({}, "anything")).toEqual([]);
  });

  test("a payload that is not an object fails an object schema as a whole", () => {
    expect(validateAgainstSchema(order, "x")).toEqual([{ path: "", code: "invalid_type" }]);
  });
});
