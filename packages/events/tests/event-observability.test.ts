import { Effect, Metric } from "effect";
import { describe, expect, test } from "vitest";
import { z } from "@relkit/schema";
import { defineEventEffect } from "../src/define-event.js";

describe("live event telemetry", () => {
  test("records calls, failures, and duration for successful and failed definitions", async () => {
    const attributes = { operation: "event.define" };
    const calls = Metric.withAttributes(
      Metric.counter("relkit_event_operations_total", { incremental: true }),
      attributes,
    );
    const failures = Metric.withAttributes(
      Metric.counter("relkit_event_failures_total", { incremental: true }),
      attributes,
    );
    const duration = Metric.withAttributes(
      Metric.histogram("relkit_event_duration_ms", {
        boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
      }),
      attributes,
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const beforeCalls = yield* Metric.value(calls);
        const beforeFailures = yield* Metric.value(failures);
        const beforeDuration = yield* Metric.value(duration);
        yield* defineEventEffect({ id: "orders.created", input: z.object({}) });
        yield* Effect.flip(defineEventEffect({ id: "orders.created", input: {} as never }));
        return {
          calls: (yield* Metric.value(calls)).count - beforeCalls.count,
          failures: (yield* Metric.value(failures)).count - beforeFailures.count,
          durations: (yield* Metric.value(duration)).count - beforeDuration.count,
        };
      }),
    );
    expect(result).toEqual({ calls: 2, failures: 1, durations: 2 });
  });
});
