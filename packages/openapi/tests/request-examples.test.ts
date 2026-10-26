/** Generated request examples respect string bounds while explicit and semantic examples remain authored. */
import { expect, test } from "vitest";
import { Effect } from "effect";
import { buildRequestEffect } from "../src/generate-request.js";
import { requestExamples } from "../src/request-examples.js";

test("mapped echo and order request bodies carry nonempty examples", () => {
  const root = {
    type: "object",
    properties: {
      orderId: { type: "string", minLength: 1 },
      sku: { type: "string", minLength: 1, maxLength: 3 },
      quantity: { type: "integer", minimum: 1 },
    },
  };
  const projected = Effect.runSync(
    buildRequestEffect(
      {
        kind: "input",
        fields: Object.fromEntries(
          Object.keys(root.properties).map((name) => [name, { kind: "body", name }]),
        ),
      },
      root,
      "/orders",
    ),
  );
  expect(projected.body?.content["application/json"]?.schema).toMatchObject({
    properties: {
      orderId: { minLength: 1, example: "example" },
      sku: { minLength: 1, maxLength: 3, example: "exa" },
      quantity: { type: "integer", minimum: 1 },
    },
  });
  expect(root.properties.orderId).not.toHaveProperty("example");
  const echo = Effect.runSync(
    buildRequestEffect(
      { kind: "whole-body" },
      {
        type: "object",
        properties: { message: { type: "string", minLength: 1 } },
      },
      "/echo",
    ),
  );
  expect(echo.body?.content["application/json"]?.schema).toMatchObject({
    properties: { message: { example: "example" } },
  });
});

test("nested examples meet bounds without replacing explicit values or guessing semantic constraints", () => {
  expect(
    requestExamples({ type: "array", items: { type: "string", minLength: 10, maxLength: 10 } }),
  ).toEqual({
    type: "array",
    items: { type: "string", minLength: 10, maxLength: 10, example: "examplexxx" },
  });
  for (const extra of [
    { example: "chosen" },
    { examples: ["chosen"] },
    { default: "chosen" },
    { enum: ["chosen"] },
    { const: "chosen" },
    { pattern: "^a+$" },
    { format: "uuid" },
    { allOf: [{ maxLength: 2 }] },
    { minLength: 5000 },
    { minLength: 4, maxLength: 2 },
  ]) {
    const schema = { type: "string", minLength: 1, ...extra };
    expect(requestExamples(schema)).toEqual(schema);
  }
});
