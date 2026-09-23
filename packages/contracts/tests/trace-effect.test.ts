import { describe, expect, test } from "vitest";
import { Effect, Exit, Layer, Metric } from "effect";
import {
  createSpanIdEffect,
  createTraceIdEffect,
  TraceRandom,
  TraceRandomError,
} from "../src/index.js";

const calls = Metric.withAttributes(
  Metric.counter("relkit_contract_operations_total", { incremental: true }),
  { operation: "trace-id.create" },
);
const failures = Metric.withAttributes(
  Metric.counter("relkit_contract_failures_total", { incremental: true }),
  { operation: "trace-id.create" },
);
const duration = Metric.withAttributes(
  Metric.histogram("relkit_contract_duration_ms", {
    boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
  }),
  { operation: "trace-id.create" },
);

describe("observable trace ID generation", () => {
  test("uses a deterministic Layer and records both success and failure", () => {
    const registry: Metric.MetricRegistry = new Map();
    const successful = Layer.succeed(TraceRandom, {
      fill: (bytes) =>
        Effect.sync(() => {
          bytes.fill(1);
        }),
    });
    const failing = Layer.succeed(TraceRandom, {
      fill: () => Effect.fail(new TraceRandomError({ cause: new Error("entropy unavailable") })),
    });
    const program = Effect.gen(function* () {
      const traceId = yield* Effect.provide(createTraceIdEffect(), successful);
      const spanId = yield* Effect.provide(createSpanIdEffect(), successful);
      const failure = yield* Effect.exit(Effect.provide(createTraceIdEffect(), failing));
      const recovered = yield* Effect.provide(createTraceIdEffect(), failing).pipe(
        Effect.catchTag("TraceRandomError", () => Effect.succeed("recovered")),
      );
      return {
        traceId,
        spanId,
        failure,
        recovered,
        callCount: (yield* Metric.value(calls)).count,
        failureCount: (yield* Metric.value(failures)).count,
        durationCount: (yield* Metric.value(duration)).count,
      };
    });
    const result = Effect.runSync(Effect.provideService(program, Metric.MetricRegistry, registry));
    expect(result.traceId).toBe("01".repeat(16));
    expect(result.spanId).toBe("01".repeat(8));
    expect(Exit.isFailure(result.failure)).toBe(true);
    expect(result.recovered).toBe("recovered");
    expect(result.callCount).toBe(3);
    expect(result.failureCount).toBe(2);
    expect(result.durationCount).toBe(3);
  });
});
