import { expect, it } from "@effect/vitest";
import { Effect, Layer, Logger, Metric } from "effect";
import { CliCleanup, cleanupLayer } from "../../src/services/cleanup.service.js";
import { CliStartNative, startNativeLive } from "../../src/commands/start-native.service.js";
import { waitForStartHealthEffect } from "../../src/commands/start-health.js";

it.effect("retains HTTP body cleanup failures without changing health status", () =>
  Effect.gen(function* () {
    const secondary = new Error("Response cancellation failed.");
    const fetcher: typeof fetch = Object.assign(
      async () =>
        new Response(new ReadableStream({ cancel: () => Promise.reject(secondary) }), {
          status: 503,
        }),
      { preconnect: () => undefined },
    );
    yield* Effect.gen(function* () {
      expect(
        yield* CliStartNative.use((native) => native.health("http://private-host/health")),
      ).toBe(false);
      const evidence = yield* (yield* CliCleanup).snapshot();
      expect(evidence.map((issue) => issue.operation)).toEqual(["start.health.release"]);
    }).pipe(
      Effect.provide(startNativeLive(fetcher)),
      Effect.provide(cleanupLayer),
      Effect.provide(Logger.layer([])),
    );
  }),
);

it.effect("observes independently called readiness without recording private bind inputs", () =>
  Effect.gen(function* () {
    const registry: Metric.MetricRegistry = new Map();
    yield* waitForStartHealthEffect("private-host", 54321, 100, { exitCode: null }).pipe(
      Effect.provide(
        Layer.succeed(CliStartNative, {
          allocate: () => Effect.succeed(54321),
          health: () => Effect.succeed(true),
        }),
      ),
      Effect.provide(Logger.layer([])),
      Effect.provideService(Metric.MetricRegistry, registry),
    );
    const entries = [...registry.values()];
    expect(
      entries.some(
        (entry) =>
          entry.id === "relkit_execution_operations_total" &&
          entry.attributes?.operation === "start.health.wait",
      ),
    ).toBe(true);
    expect(JSON.stringify(entries.map((entry) => entry.attributes))).not.toContain("private-host");
    expect(JSON.stringify(entries.map((entry) => entry.attributes))).not.toContain("54321");
  }),
);
