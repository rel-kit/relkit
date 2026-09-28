import { describe, expect, test } from "vitest";
import { Cause, Effect, Exit, Layer, Metric } from "effect";
import { z, type StandardSchemaV1 } from "@relkit/schema";
import { defineError } from "../src/define-error.js";
import { fail, failEffect } from "../src/handler-result.js";
import {
  FunctionOperationError,
  FunctionTelemetry,
  observeFunction,
  type FunctionOperation,
} from "../src/function-observability.js";
import { isStreamOutputSchemaEffect, streamOf, streamOfEffect } from "../src/stream.js";

describe("Effect authoring boundaries", () => {
  test("uses a supplied telemetry Layer for successful operations", async () => {
    const observed: FunctionOperation[] = [];
    const testLayer = Layer.succeed(FunctionTelemetry, {
      observe: (operation, effect) => {
        observed.push(operation);
        return effect;
      },
    });
    const output = await Effect.runPromise(Effect.provide(streamOfEffect(z.string()), testLayer));
    expect(output.kind).toBe("stream");
    expect(observed).toEqual(["stream.create"]);
    expect(await Effect.runPromise(isStreamOutputSchemaEffect(output))).toBe(true);
  });

  test("reports typed failures and preserves synchronous adapter errors", async () => {
    const invalid = null as unknown as StandardSchemaV1;
    const exit = await Effect.runPromiseExit(streamOfEffect(invalid));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(FunctionOperationError);
    }
    expect(() => streamOf(invalid)).toThrowError(
      "streamOf item must be a Standard Schema v1 validator",
    );
  });

  test("creates a handler failure through Effect", async () => {
    const NotFound = defineError({
      id: "orders.not-found",
      data: z.object({ id: z.string() }),
      message: "Missing order",
    });
    const failure = await Effect.runPromise(failEffect(NotFound, { id: "one" }));
    expect(failure._tag).toBe("FunctionFailure");
    expect(failure.error.message).toBe("Missing order");
    expect(fail(NotFound, { id: "two" }).error.message).toBe("Missing order");
  });

  test("records bounded success and failure metrics in the live Layer", async () => {
    const snapshots = await Effect.runPromise(
      Effect.provideService(
        Effect.gen(function* () {
          yield* streamOfEffect(z.string());
          yield* Effect.exit(streamOfEffect(null as unknown as StandardSchemaV1));
          return yield* Metric.snapshot;
        }),
        Metric.MetricRegistry,
        new Map(),
      ),
    );
    const counter = snapshots.find(
      (entry) =>
        entry.id === "relkit_function_operations_total" &&
        entry.attributes?.operation === "stream.create",
    );
    const failure = snapshots.find(
      (entry) =>
        entry.id === "relkit_function_failures_total" &&
        entry.attributes?.operation === "stream.create",
    );
    const duration = snapshots.find(
      (entry) =>
        entry.id === "relkit_function_duration_ms" &&
        entry.attributes?.operation === "stream.create",
    );
    expect(counter?.state).toMatchObject({ count: 2 });
    expect(failure?.state).toMatchObject({ count: 1 });
    expect(duration?.state).toMatchObject({ count: 2 });
  });

  test("opens a stable operation span", async () => {
    const name = await Effect.runPromise(
      observeFunction(
        "stream.is-output",
        Effect.map(Effect.currentSpan, (span) => span.name),
      ),
    );
    expect(name).toBe("functions.stream.is-output");
  });
});
