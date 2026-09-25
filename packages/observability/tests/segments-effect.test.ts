import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Fiber, Metric } from "effect";
import { expect, test } from "vitest";
import {
  createObservabilitySegmentStore,
  makeObservabilitySegmentStoreEffect,
  observabilitySegmentStoreLayer,
  ObservabilitySegmentStoreService,
} from "../src/storage/segments.js";
import type { ObservabilitySegmentStoreEffects } from "../src/storage/segments-effect.types.js";
test("Effect segment store reports typed failures and operation outcomes", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-segments-effect-"));
  try {
    const registry = new Map();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* makeObservabilitySegmentStoreEffect({ root });
        yield* store.flush();
        yield* store.close();
        const failure = yield* store.append({ signal: "log" } as never).pipe(Effect.flip);
        const successes = yield* Metric.value(
          Metric.counter("relkit_observability_segment_operations_total", {
            attributes: { operation: "flush", outcome: "success" },
          }),
        );
        const failures = yield* Metric.value(
          Metric.counter("relkit_observability_segment_operations_total", {
            attributes: { operation: "append", outcome: "failure" },
          }),
        );
        return { failure, successes, failures };
      }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
    );
    expect(result.failure).toMatchObject({
      _tag: "SegmentOperationError",
      operation: "append",
      message: "Observability segment store is closed",
    });
    expect(result.successes.count).toBe(1);
    expect(result.failures.count).toBe(1);
    const compatible = await createObservabilitySegmentStore({ root });
    await compatible.close();
    await expect(compatible.append({ signal: "log" } as never)).rejects.toThrow(
      "Observability segment store is closed",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("segment store Layer closes handles on Scope exit", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-segments-scope-"));
  try {
    const store = await Effect.runPromise(
      Effect.gen(function* () {
        const owned = yield* ObservabilitySegmentStoreService;
        yield* owned.flush();
        return owned;
      }).pipe(Effect.provide(observabilitySegmentStoreLayer({ root }))),
    );
    const closed = await Effect.runPromise(
      store.append({ signal: "log" } as never).pipe(Effect.flip),
    );
    expect(closed.message).toBe("Observability segment store is closed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("interrupting a segment store scope closes its resource", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-segments-interrupt-"));
  try {
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let store!: ObservabilitySegmentStoreEffects;
    const fiber = Effect.runFork(
      Effect.gen(function* () {
        store = yield* ObservabilitySegmentStoreService;
        ready();
        yield* Effect.never;
      }).pipe(Effect.provide(observabilitySegmentStoreLayer({ root }))),
    );
    await started;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(
      (await Effect.runPromise(store.append({ signal: "log" } as never).pipe(Effect.flip))).message,
    ).toBe("Observability segment store is closed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
