import { describe, expect, test } from "vitest";
import { Effect, Layer, Metric } from "effect";
import { validate, validateSync, z } from "../src/index.js";
import {
  SchemaAsyncError,
  SchemaExecutionError,
  SchemaInvalidError,
  SchemaIssuesError,
  SchemaValidator,
  validateEffect,
  validateSyncEffect,
} from "../src/standard-schema-effect.js";
import type { StandardResult, StandardSchemaV1 } from "../src/standard-schema.types.js";

const calls = Metric.withAttributes(
  Metric.counter("relkit_schema_operations_total", { incremental: true }),
  { operation: "validate" },
);
const failures = Metric.withAttributes(
  Metric.counter("relkit_schema_failures_total", { incremental: true }),
  { operation: "validate" },
);
const duration = Metric.withAttributes(
  Metric.histogram("relkit_schema_duration_ms", {
    boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
  }),
  { operation: "validate" },
);

describe("Effect validation", () => {
  test("uses a supplied validator Layer and records success and failure", async () => {
    const registry: Metric.MetricRegistry = new Map();
    const schema = z.string();
    const stub = Layer.succeed(SchemaValidator, {
      validate: <T>(_schema: StandardSchemaV1<unknown, T>, value: unknown): StandardResult<T> =>
        typeof value === "string"
          ? { value: value.toUpperCase() as T }
          : { issues: [{ message: "bad" }] },
    });
    const program = Effect.gen(function* () {
      const good = yield* Effect.provide(validateEffect(schema, "ok"), stub);
      const bad = yield* Effect.provide(validateEffect(schema, 42 as never), stub).pipe(
        Effect.catchTag("SchemaIssuesError", (error) => Effect.succeed(error.issues[0]?.message)),
      );
      return {
        good,
        bad,
        callCount: (yield* Metric.value(calls)).count,
        failureCount: (yield* Metric.value(failures)).count,
        durationCount: (yield* Metric.value(duration)).count,
        durationSum: (yield* Metric.value(duration)).sum,
      };
    });
    const result = await Effect.runPromise(
      Effect.provideService(program, Metric.MetricRegistry, registry),
    );
    expect(result).toMatchObject({
      good: "OK",
      bad: "bad",
      callCount: 2,
      failureCount: 1,
      durationCount: 2,
    });
    expect(result.durationSum).toBeGreaterThan(0);
  });

  test("exposes tagged invalid, asynchronous, and execution failures", async () => {
    const schema = z.string();
    const asyncLayer = Layer.succeed(SchemaValidator, {
      validate: async <T>() => ({ value: "ready" as T }),
    });
    const rejectingLayer = Layer.succeed(SchemaValidator, {
      validate: () => Promise.reject(new Error("offline")),
    });
    const invalid = await Effect.runPromise(
      validateEffect({} as StandardSchemaV1, "x").pipe(
        Effect.provide(asyncLayer),
        Effect.catchTag("SchemaInvalidError", (error) => Effect.succeed(error)),
      ),
    );
    const asynchronous = Effect.runSync(
      validateSyncEffect(schema, "x").pipe(
        Effect.provide(asyncLayer),
        Effect.catchTag("SchemaAsyncError", (error) => Effect.succeed(error)),
      ),
    );
    const rejected = await Effect.runPromise(
      validateEffect(schema, "x").pipe(
        Effect.provide(rejectingLayer),
        Effect.catchTag("SchemaExecutionError", (error) => Effect.succeed(error)),
      ),
    );
    expect(invalid).toBeInstanceOf(SchemaInvalidError);
    expect(asynchronous).toBeInstanceOf(SchemaAsyncError);
    expect(rejected).toBeInstanceOf(SchemaExecutionError);
  });

  test("preserves compatibility result and TypeError behavior", async () => {
    expect(validateSync(z.string(), 1 as never)).toEqual({
      issues: [{ message: "Expected a string", path: [] }],
    });
    expect(validateSync(z.string(), "ok")).toEqual({ value: "ok" });
    expect(
      await validate(
        z.string().transform(async (value) => value.trim()),
        " ok ",
      ),
    ).toEqual({
      value: "ok",
    });
    expect(() =>
      validateSync(
        z.string().transform(async (value) => value),
        "ok",
      ),
    ).toThrow("Schema validation is asynchronous");
    expect(() => validateSync({} as StandardSchemaV1, "x")).toThrow(
      "Value is not a Standard Schema v1 validator",
    );
    const recovered = await Effect.runPromise(
      validateEffect(z.string(), 1 as never).pipe(
        Effect.provide(Layer.succeed(SchemaValidator, { validate: () => ({ issues: [] }) })),
        Effect.catchTag("SchemaIssuesError", (error) => Effect.succeed(error)),
      ),
    );
    expect(recovered).toBeInstanceOf(SchemaIssuesError);
  });
});
