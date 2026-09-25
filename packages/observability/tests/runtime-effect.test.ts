import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Fiber, Metric } from "effect";
import { expect, test } from "vitest";
import {
  createObservabilityRuntime,
  makeObservabilityRuntimeEffect,
  observabilityRuntimeLayer,
  ObservabilityRuntimeService,
} from "../src/runtime.js";
import type { ObservabilityRuntimeEffects } from "../src/runtime-effect.types.js";
import { ObservabilityStreamError } from "../src/stream.js";
test("Effect runtime reports tagged acquisition failure and metrics", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const failure = yield* makeObservabilityRuntimeEffect({ maxRecords: 0 }).pipe(Effect.flip);
      const failures = yield* Metric.value(
        Metric.counter("relkit_observability_runtime_operations_total", {
          attributes: { operation: "create", outcome: "failure" },
        }),
      );
      return { failure, failures };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.failure).toMatchObject({ _tag: "RuntimeOperationError", operation: "create" });
  expect(result.failures.count).toBe(1);
  await expect(createObservabilityRuntime({ maxRecords: 0 })).rejects.toThrow();
});
test("interrupting the runtime Layer releases its owned stream", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-runtime-effect-"));
  try {
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let runtime!: ObservabilityRuntimeEffects;
    const fiber = Effect.runFork(
      Effect.gen(function* () {
        runtime = yield* ObservabilityRuntimeService;
        ready();
        yield* Effect.never;
      }).pipe(Effect.provide(observabilityRuntimeLayer({ root }))),
    );
    await started;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(() => runtime.stream.publish({ type: "log.emitted", data: {} })).toThrow(
      ObservabilityStreamError,
    );
    await runtime.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
