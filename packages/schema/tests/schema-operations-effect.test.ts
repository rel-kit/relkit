import { describe, expect, test } from "vitest";
import { Effect, Metric } from "effect";
import { buildSchema, buildSchemaEffect, SchemaBuilderError } from "../src/builder-effect.js";
import {
  createSchema,
  createSchemaEffect,
  runSchema,
  runSchemaEffect,
} from "../src/schema-impl.js";
import {
  parseSchemaAsyncEffect,
  parseSchemaSyncEffect,
  safeParseSchema,
} from "../src/schema-parse.js";
import { SchemaValidationError } from "../src/schema-validation-error.js";
import { SchemaAsyncError, SchemaIssuesError } from "../src/standard-schema-effect.js";
import { SchemaExecutionError } from "../src/standard-schema-effect.js";
import type { StandardSchemaV1 } from "../src/standard-schema.types.js";

const calls = Metric.withAttributes(
  Metric.counter("relkit_schema_operations_total", { incremental: true }),
  { operation: "builder.file" },
);
const failures = Metric.withAttributes(
  Metric.counter("relkit_schema_failures_total", { incremental: true }),
  { operation: "builder.file" },
);

describe("schema construction and parsing Effects", () => {
  test("builder Effects expose tagged failures and observed metrics", () => {
    const registry: Metric.MetricRegistry = new Map();
    const program = Effect.gen(function* () {
      const value = yield* buildSchemaEffect("builder.file", () => 3);
      const error = yield* buildSchemaEffect("builder.file", () => {
        throw new TypeError("bad file option");
      }).pipe(Effect.catchTag("SchemaBuilderError", (failure) => Effect.succeed(failure)));
      return {
        value,
        error,
        callCount: (yield* Metric.value(calls)).count,
        failureCount: (yield* Metric.value(failures)).count,
      };
    });
    const result = Effect.runSync(Effect.provideService(program, Metric.MetricRegistry, registry));
    expect(result.value).toBe(3);
    expect(result.error).toBeInstanceOf(SchemaBuilderError);
    expect(result.error.cause).toBeInstanceOf(TypeError);
    expect(result.error.message).toBe("bad file option");
    expect(result.callCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(() =>
      buildSchema("builder.file", () => {
        throw new TypeError("invalid options");
      }),
    ).toThrow("invalid options");
  });

  test("construction and execution Effects preserve tagged failures and original causes", () => {
    const metadata = Object.defineProperty({}, "jsonSchema", {
      get: () => {
        throw new TypeError("metadata getter failed");
      },
    });
    const constructionError = Effect.runSync(
      createSchemaEffect(() => ({ value: 1 }), metadata).pipe(
        Effect.catchTag("SchemaExecutionError", (error) => Effect.succeed(error)),
      ),
    );
    expect(constructionError).toBeInstanceOf(SchemaExecutionError);
    expect(() => createSchema(() => ({ value: 1 }), metadata)).toThrow("metadata getter failed");

    const throwing: StandardSchemaV1 = {
      "~standard": {
        version: 1,
        vendor: "throwing-fixture",
        validate: () => {
          throw new TypeError("validator failed");
        },
      },
    };
    const executionError = Effect.runSync(
      runSchemaEffect(throwing, "input").pipe(
        Effect.catchTag("SchemaExecutionError", (error) => Effect.succeed(error)),
      ),
    );
    expect(executionError).toBeInstanceOf(SchemaExecutionError);
    expect(() => runSchema(throwing, "input")).toThrow("validator failed");
    const internal = createSchema(() => {
      throw new TypeError("internal check failed");
    });
    expect(() => internal.parse("input")).toThrow("internal check failed");
  });

  test("parsing Effects distinguish issues, async checks, and success", async () => {
    expect(Effect.runSync(parseSchemaSyncEffect(() => ({ value: 2 })))).toBe(2);
    const invalid = Effect.runSync(
      parseSchemaSyncEffect(() => ({ issues: [{ message: "bad" }] })).pipe(
        Effect.catchTag("SchemaIssuesError", (error) => Effect.succeed(error)),
      ),
    );
    expect(invalid).toBeInstanceOf(SchemaIssuesError);
    expect(invalid).toMatchObject({ message: "Schema validation failed" });
    const asynchronous = Effect.runSync(
      parseSchemaSyncEffect(() => Promise.resolve({ value: 1 })).pipe(
        Effect.catchTag("SchemaAsyncError", (error) => Effect.succeed(error)),
      ),
    );
    expect(asynchronous).toBeInstanceOf(SchemaAsyncError);
    expect(
      await Effect.runPromise(parseSchemaAsyncEffect(() => Promise.resolve({ value: "ok" }))),
    ).toBe("ok");
    expect(
      await Effect.runPromise(
        parseSchemaAsyncEffect(() => Promise.resolve({ issues: [{ message: "bad" }] })).pipe(
          Effect.catchTag("SchemaIssuesError", (error) => Effect.succeed(error.issues)),
        ),
      ),
    ).toEqual([{ message: "bad" }]);

    const thrown = Effect.runSync(
      parseSchemaSyncEffect(() => {
        throw new TypeError("sync check failed");
      }).pipe(Effect.catchTag("SchemaExecutionError", (error) => Effect.succeed(error))),
    );
    expect(thrown).toBeInstanceOf(SchemaExecutionError);
    expect(thrown).toMatchObject({ message: "Schema validation failed unexpectedly" });
    const rejected = await Effect.runPromise(
      parseSchemaAsyncEffect(() => Promise.reject(new TypeError("async check failed"))).pipe(
        Effect.catchTag("SchemaExecutionError", (error) => Effect.succeed(error)),
      ),
    );
    expect(rejected).toBeInstanceOf(SchemaExecutionError);
  });

  test("safe parsing retains sync/async result shapes", async () => {
    expect(safeParseSchema(() => ({ value: "ok" }))).toEqual({ value: "ok" });
    expect(safeParseSchema(() => ({ issues: [{ message: "bad" }] }))).toEqual({
      issues: [{ message: "bad" }],
    });
    expect(await safeParseSchema(() => Promise.resolve({ value: "ok" }))).toEqual({ value: "ok" });
    expect(await safeParseSchema(() => Promise.resolve({ issues: [{ message: "bad" }] }))).toEqual({
      issues: [{ message: "bad" }],
    });
    expect(() =>
      safeParseSchema(() => {
        throw new TypeError("callback failed");
      }),
    ).toThrow("callback failed");
    await expect(safeParseSchema(() => Promise.reject(new TypeError("rejected")))).rejects.toThrow(
      "rejected",
    );
    expect(() => {
      throw new SchemaValidationError([{ message: "bad" }]);
    }).toThrow(SchemaValidationError);
  });
});
