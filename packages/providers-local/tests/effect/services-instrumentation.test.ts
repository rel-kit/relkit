/** Verifies structured operation diagnostics and native callback metrics without enabling human polling noise at ordinary log levels. */
import { it, expect } from "@effect/vitest";

import { Effect, Fiber, Metric, References } from "effect";

import { join } from "node:path";
import { createLoggerLayer, type LogRecord } from "@relkit/runtime-effect";

import { localOperation, localPromise, localSync, runLocal } from "../../src/local-effect.js";

it.effect("native compatibility hops preserve configured sinks, levels and metrics", () =>
  Effect.gen(function* () {
    const records: LogRecord[] = [];
    const logger = createLoggerLayer({
      minimumLevel: "info",
      human: false,
      json: { write: (record) => records.push(record) },
    });
    yield* Effect.gen(function* () {
      const error = new TypeError("expected boundary failure");
      expect(
        yield* localPromise(() =>
          runLocal(localOperation("Test.nativeRoundTrip", Effect.succeed(42))),
        ),
      ).toBe(42);
      yield* Effect.result(
        localPromise(() =>
          runLocal(
            localOperation(
              "Test.nativeFailure",
              localSync(() => {
                throw error;
              }),
            ),
          ),
        ),
      );
      const child = yield* Effect.forkChild(
        localPromise(() => runLocal(Effect.logDebug("child diagnostic"))).pipe(
          Effect.provideService(References.MinimumLogLevel, "Debug"),
        ),
      );
      yield* Fiber.join(child);
      yield* localPromise(() => runLocal(Effect.logDebug("parent hidden")));
      const metric = Metric.withAttributes(
        Metric.counter("relkit_execution_operations_total", { incremental: true }),
        { domain: "local", operation: "Test.nativeRoundTrip" },
      );
      expect((yield* Metric.value(metric)).count).toBe(1);
    }).pipe(
      Effect.provide(logger),
      Effect.provideService(Metric.MetricRegistry, new Map()),
      Effect.annotateLogs({ requestId: "request", token: "secret" }),
    );
    expect(records.map((record) => record.fields.outcome).filter(Boolean)).toEqual([
      "success",
      "failure",
    ]);
    expect(records.some((record) => record.message === "child diagnostic")).toBe(true);
    expect(records.some((record) => record.message === "parent hidden")).toBe(false);
    expect(JSON.stringify(records)).not.toContain("secret");
  }),
);
