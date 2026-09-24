import { Effect } from "effect";
import { describe, expect, test } from "vitest";
import {
  getSchemaProjectionEffect,
  isSchemaOptionalEffect,
} from "../src/json-schema-inspection.js";
import { JsonSchemaValueError, sortJsonValue, sortJsonValueEffect } from "../src/json-schema.js";
import {
  addPathEffect,
  projectJsonSchemaEffect,
  SchemaProjectionError,
} from "../src/schema-impl-helpers.js";
import {
  failureEffect,
  flatMapResultEffect,
  isFailureEffect,
  isPromiseLikeEffect,
  mapResultEffect,
  mapValueEffect,
  successEffect,
} from "../src/schema-result.js";
import { z } from "../src/index.js";

describe("direct Effect helpers", () => {
  test("maps synchronous and asynchronous validation results", async () => {
    expect(Effect.runSync(successEffect(2))).toEqual({ value: 2 });
    expect(Effect.runSync(failureEffect("bad", ["name"]))).toEqual({
      issues: [{ message: "bad", path: ["name"] }],
    });
    expect(Effect.runSync(isFailureEffect({ issues: [{ message: "bad" }] }))).toBe(true);
    expect(Effect.runSync(isPromiseLikeEffect(Promise.resolve(1)))).toBe(true);
    expect(Effect.runSync(mapResultEffect({ value: 2 }, (result) => result))).toEqual({ value: 2 });
    expect(
      await Effect.runSync(mapResultEffect(Promise.resolve({ value: 2 }), (result) => result)),
    ).toEqual({ value: 2 });
    expect(
      Effect.runSync(flatMapResultEffect({ value: 2 }, (value) => ({ value: value + 1 }))),
    ).toEqual({ value: 3 });
    expect(
      await Effect.runSync(
        flatMapResultEffect(Promise.resolve({ value: 2 }), (value) => ({ value: value + 1 })),
      ),
    ).toEqual({ value: 3 });
    expect(Effect.runSync(mapValueEffect(2, (value) => value + 1))).toBe(3);
    expect(await Effect.runSync(mapValueEffect(Promise.resolve(2), (value) => value + 1))).toBe(3);
  });

  test("inspects projections and optionality through Effect", () => {
    const schema = z.string().optional();
    expect(Effect.runSync(getSchemaProjectionEffect(schema, "input"))?.()).toEqual({
      type: "string",
    });
    expect(Effect.runSync(isSchemaOptionalEffect(schema, "output"))).toBe(true);
    expect(Effect.runSync(isSchemaOptionalEffect(z.string(), "output"))).toBe(false);
  });

  test("prefixes third-party issue paths without changing promise shape", async () => {
    const failure = { issues: [{ message: "bad", path: ["email"] }] };
    expect(Effect.runSync(addPathEffect(failure, ["user"]))).toEqual({
      issues: [{ message: "bad", path: ["user", "email"] }],
    });
    expect(await Effect.runSync(addPathEffect(Promise.resolve(failure), ["user"]))).toEqual({
      issues: [{ message: "bad", path: ["user", "email"] }],
    });
    expect(Effect.runSync(addPathEffect({ value: 1 }, ["user"]))).toEqual({ value: 1 });
  });

  test("tags projection errors and preserves compatibility exceptions", () => {
    expect(
      Effect.runSync(
        projectJsonSchemaEffect({ jsonSchema: () => ({ type: "string" }) }, "input", "draft-07"),
      ),
    ).toEqual({ type: "string" });
    const projectionError = Effect.runSync(
      projectJsonSchemaEffect({}, "input", "draft-07").pipe(
        Effect.catchTag("SchemaProjectionError", (error) => Effect.succeed(error)),
      ),
    );
    expect(projectionError).toBeInstanceOf(SchemaProjectionError);
    expect(Effect.runSync(sortJsonValueEffect({ required: ["z", "a"] }, "$", undefined))).toEqual({
      required: ["a", "z"],
    });
    expect(sortJsonValue(-0, "$", undefined)).toBe(0);
    expect(sortJsonValue({ values: [2, 1] }, "$", undefined)).toEqual({ values: [2, 1] });
    const valueError = Effect.runSync(
      sortJsonValueEffect(Infinity, "$", undefined).pipe(
        Effect.catchTag("JsonSchemaValueError", (error) => Effect.succeed(error)),
      ),
    );
    expect(valueError).toBeInstanceOf(JsonSchemaValueError);
    expect(() => sortJsonValue(Infinity, "$", undefined)).toThrow("non-finite numbers");
  });
});
