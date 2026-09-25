import { Effect, Exit, Layer, Metric } from "effect";
import { describe, expect, test, vi } from "vitest";
import { createTraceIdentifiersEffect, TraceRandom, TraceRandomError } from "../src/index.js";
const pairCalls = Metric.withAttributes(
  Metric.counter("relkit_contract_operations_total", { incremental: true }),
  { operation: "trace-identifiers.create" },
);
const pairFailures = Metric.withAttributes(
  Metric.counter("relkit_contract_failures_total", { incremental: true }),
  { operation: "trace-identifiers.create" },
);
describe("concurrent trace identifier generation", () => {
  test("starts both byte requests and retains the named results", async () => {
    const releases: Array<() => void> = [];
    const registry: Metric.MetricRegistry = new Map();
    const random = Layer.succeed(TraceRandom, {
      fill: (bytes) =>
        Effect.promise(async () => {
          await new Promise<void>((resolve) => releases.push(resolve));
          bytes.fill(bytes.length === 16 ? 1 : 2);
        }),
    });
    const running = Effect.runPromise(
      Effect.provideService(
        Effect.provide(createTraceIdentifiersEffect(), random),
        Metric.MetricRegistry,
        registry,
      ),
    );
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[1]!();
    releases[0]!();
    const identifiers = await running;
    expect(identifiers).toEqual({ traceId: "01".repeat(16), spanId: "02".repeat(8) });
    expect(Object.isFrozen(identifiers)).toBe(true);
    expect(
      Effect.runSync(
        Effect.provideService(Metric.value(pairCalls), Metric.MetricRegistry, registry),
      ).count,
    ).toBe(1);
  });
  test("interrupts the other byte request when one fails", async () => {
    const started: number[] = [];
    const interrupted: number[] = [];
    const registry: Metric.MetricRegistry = new Map();
    const random = Layer.succeed(TraceRandom, {
      fill: (bytes) =>
        Effect.gen(function* () {
          started.push(bytes.length);
          if (bytes.length === 16) {
            yield* Effect.yieldNow;
            return yield* Effect.fail(new TraceRandomError({ cause: "entropy unavailable" }));
          }
          return yield* Effect.never.pipe(
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                interrupted.push(bytes.length);
              }),
            ),
          );
        }),
    });
    const exit = await Effect.runPromiseExit(
      Effect.provideService(
        Effect.provide(createTraceIdentifiersEffect(), random),
        Metric.MetricRegistry,
        registry,
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(started).toContain(16);
    expect(started).toContain(8);
    expect(interrupted).toEqual([8]);
    expect(
      Effect.runSync(
        Effect.provideService(Metric.value(pairFailures), Metric.MetricRegistry, registry),
      ).count,
    ).toBe(1);
  });
});
