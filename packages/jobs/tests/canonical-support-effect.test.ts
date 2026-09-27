import { expect, test } from "vitest";
import { Effect, Result } from "effect";
import {
  assertCanonicalProjection,
  assertCanonicalProjectionEffect,
  CanonicalProjectionError,
} from "../src/canonical-support.ts";

test("walks nested canonical schema positions in Effect", async () => {
  const schema = {
    type: "object",
    properties: { id: { type: "string" } },
    additionalProperties: { type: "number" },
    items: { type: "boolean" },
    prefixItems: [{ type: "null" }],
    anyOf: [{ type: "string" }],
    oneOf: [{ type: "number" }],
    allOf: [{ type: "object" }],
  };
  await Effect.runPromise(assertCanonicalProjectionEffect(schema, "input"));
  expect(() => assertCanonicalProjection(schema, "input")).not.toThrow();
  await Effect.runPromise(
    assertCanonicalProjectionEffect({ "x-relkit-void": true }, "output", true),
  );
});

test("reports a typed failure for noncanonical nested values", async () => {
  const invalid = { type: "array", items: { format: "binary" } };
  const result = await Effect.runPromise(
    Effect.result(assertCanonicalProjectionEffect(invalid, "input")),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(CanonicalProjectionError);
    expect(result.failure._tag).toBe("Jobs.CanonicalProjectionError");
    expect(result.failure.reason).toContain("binary");
  }
  expect(() => assertCanonicalProjection(invalid, "input")).toThrow(TypeError);
  expect(() => assertCanonicalProjection({}, "input")).toThrow("bounded");
  expect(() =>
    assertCanonicalProjection({ properties: { nested: { "x-relkit-void": true } } }, "input", true),
  ).toThrow("void");
});
