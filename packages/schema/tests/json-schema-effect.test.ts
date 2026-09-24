import { describe, expect, test } from "vitest";
import { Effect, Layer, Metric } from "effect";
import { getJsonSchema, z } from "../src/index.js";
import {
  getJsonSchemaEffect,
  JsonSchemaUnavailableError,
  SchemaProjector,
} from "../src/json-schema-effect.js";
import type { StandardSchemaV1 } from "../src/standard-schema.types.js";

const calls = Metric.withAttributes(
  Metric.counter("relkit_schema_operations_total", { incremental: true }),
  { operation: "json-schema" },
);
const failures = Metric.withAttributes(
  Metric.counter("relkit_schema_failures_total", { incremental: true }),
  { operation: "json-schema" },
);

describe("Effect JSON Schema projection", () => {
  test("uses a supplied projector Layer and records success and failure", () => {
    const registry: Metric.MetricRegistry = new Map();
    const projector = Layer.succeed(SchemaProjector, {
      projection: (_schema, direction) =>
        direction === "input" ? () => ({ type: "string", required: ["z", "a"] }) : undefined,
    });
    const program = Effect.gen(function* () {
      const schema = z.string();
      const success = yield* Effect.provide(
        getJsonSchemaEffect(schema, { direction: "input" }),
        projector,
      );
      const failure = yield* Effect.provide(getJsonSchemaEffect(schema), projector).pipe(
        Effect.catchTag("JsonSchemaUnavailableError", (error) => Effect.succeed(error.reason)),
      );
      return {
        success,
        failure,
        callCount: (yield* Metric.value(calls)).count,
        failureCount: (yield* Metric.value(failures)).count,
      };
    });
    expect(Effect.runSync(Effect.provideService(program, Metric.MetricRegistry, registry))).toEqual(
      {
        success: { required: ["a", "z"], type: "string" },
        failure: "Schema does not expose a deterministic projection",
        callCount: 2,
        failureCount: 1,
      },
    );
  });

  test("returns tagged failures for invalid inputs and projection hooks", () => {
    const cases: readonly [StandardSchemaV1, unknown, string][] = [
      [{} as StandardSchemaV1, undefined, "Schema is not a Standard Schema v1 validator"],
      [z.string(), { direction: "sideways" }, 'Unsupported schema projection direction "sideways"'],
    ];
    for (const [schema, options, reason] of cases) {
      const error = Effect.runSync(
        getJsonSchemaEffect(schema, options as never).pipe(
          Effect.provide(Layer.succeed(SchemaProjector, { projection: () => undefined })),
          Effect.catchTag("JsonSchemaUnavailableError", (failure) => Effect.succeed(failure)),
        ),
      );
      expect(error).toBeInstanceOf(JsonSchemaUnavailableError);
      expect(error.reason).toBe(reason);
      expect(error.message).toBe(reason);
    }
    const throwing = Layer.succeed(SchemaProjector, {
      projection: () => () => {
        throw new Error("projection failed");
      },
    });
    const error = Effect.runSync(
      getJsonSchemaEffect(z.string()).pipe(
        Effect.provide(throwing),
        Effect.catchTag("JsonSchemaUnavailableError", (failure) => Effect.succeed(failure)),
      ),
    );
    expect(error.reason).toBe("projection failed");
    const selecting = Layer.succeed(SchemaProjector, {
      projection: () => {
        throw new TypeError("selection failed");
      },
    });
    const selectionError = Effect.runSync(
      getJsonSchemaEffect(z.string()).pipe(
        Effect.provide(selecting),
        Effect.catchTag("JsonSchemaUnavailableError", (failure) => Effect.succeed(failure)),
      ),
    );
    expect(selectionError.reason).toBe("selection failed");
  });

  test("canonicalizes JSON values and reports invalid projection data", () => {
    const cases: readonly [unknown, string][] = [
      [Infinity, "non-finite numbers are not supported"],
      [new Date(), "object prototype"],
      [Symbol("x"), "non-JSON data"],
      [{ value: undefined }, "non-JSON data"],
      [{ [Symbol("x")]: 1 }, "symbol keys"],
      [Object.defineProperty({}, "value", { get: () => 1, enumerable: true }), "accessor"],
      [Object.assign([1], { extra: true }), "array properties"],
      [Object.setPrototypeOf([1], null), "array prototype"],
      [["value"], "JSON object"],
    ];
    for (const [value, reason] of cases) {
      const schema = z.string();
      const projector = Layer.succeed(SchemaProjector, { projection: () => () => value as never });
      const error = Effect.runSync(
        getJsonSchemaEffect(schema).pipe(
          Effect.provide(projector),
          Effect.catchTag("JsonSchemaUnavailableError", (failure) => Effect.succeed(failure)),
        ),
      );
      expect(error.reason).toContain(reason);
    }
    const custom = z.string();
    expect(getJsonSchema(custom)).toEqual({ ok: true, schema: { type: "string" } });
  });
});
