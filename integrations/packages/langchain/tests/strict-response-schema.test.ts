/** Keeps authored validation intact while enabling provider enforcement for compatible Responses schemas. */
import { Effect } from "effect";
import { ProviderStrategy } from "langchain";
import { getJsonSchema, z } from "@relkit/schema";
import { expect, test } from "vitest";
import { responseFormatEffect } from "../src/runtime-native-response-format.js";
import { strictResponseSchema } from "../src/runtime-strict-response-schema.js";
import { createTestModel } from "./test-model.js";

test("Luna answer schema uses strict provider output and rejects extra envelope fields", () => {
  const model = Object.assign(createTestModel([]).model, { useResponsesApi: true });
  const format = Effect.runSync(responseFormatEffect(z.object({ answer: z.string() }), model));
  expect(format).toBeInstanceOf(ProviderStrategy);
  if (!(format instanceof ProviderStrategy)) throw new Error("Expected native provider strategy");
  expect(format.strict).toBe(true);
  expect(format.schema).toMatchObject({
    additionalProperties: false,
    properties: {
      value: { additionalProperties: false, required: ["answer"] },
    },
  });
});

test("optional fields and unsupported constraints keep their original projection", () => {
  const model = Object.assign(createTestModel([]).model, { useResponsesApi: true });
  for (const schema of [
    z.object({ answer: z.string(), note: z.string().optional() }),
    z.object({ answer: z.string().min(1) }),
  ]) {
    const projection = getJsonSchema(schema);
    if (!projection.ok) throw new Error("Expected projection");
    const format = Effect.runSync(responseFormatEffect(schema, model));
    if (!(format instanceof ProviderStrategy)) throw new Error("Expected native provider strategy");
    expect(format.strict).toBe(false);
    expect(format.schema).toMatchObject({ properties: { value: projection.schema } });
  }
});

test("closes nested arrays/unions without mutating the authored projection", () => {
  const projection = getJsonSchema(
    z.object({ rows: z.array(z.object({ value: z.union([z.string(), z.number()]) })) }),
  );
  if (!projection.ok) throw new Error("Expected projection");
  const before = JSON.stringify(projection.schema);
  expect(strictResponseSchema(projection.schema)).toMatchObject({
    additionalProperties: false,
    properties: {
      rows: { items: { additionalProperties: false } },
    },
  });
  expect(JSON.stringify(projection.schema)).toBe(before);
  expect(
    strictResponseSchema({
      type: "object",
      properties: {},
      required: [],
      additionalProperties: true,
    }),
  ).toBeUndefined();
  expect(strictResponseSchema({ type: "string" }, 6)).toBeUndefined();
});
