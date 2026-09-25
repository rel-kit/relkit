import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Fiber, Metric } from "effect";
import { expect, test } from "vitest";
import {
  createObservabilityIndex,
  makeObservabilityIndexEffect,
  observabilityIndexLayer,
  ObservabilityIndexService,
} from "../src/storage/index.js";
import type { ObservabilityIndexEffects } from "../src/storage/index-effect.types.js";
test("Effect index exposes typed validation, metrics, and adapter errors", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-index-effect-"));
  try {
    const registry = new Map();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const index = yield* makeObservabilityIndexEffect({ root });
        const page = yield* index.page();
        const failure = yield* index.page({ limit: 0 }).pipe(Effect.flip);
        const successes = yield* Metric.value(
          Metric.counter("relkit_observability_index_operations_total", {
            attributes: { operation: "page", outcome: "success" },
          }),
        );
        const failures = yield* Metric.value(
          Metric.counter("relkit_observability_index_operations_total", {
            attributes: { operation: "page", outcome: "failure" },
          }),
        );
        yield* index.close();
        return { page, failure, successes, failures };
      }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
    );
    expect(result.page.entries).toEqual([]);
    expect(result.failure).toMatchObject({ _tag: "IndexOperationError", operation: "page" });
    expect(result.successes.count).toBe(1);
    expect(result.failures.count).toBe(1);
    const compatible = await createObservabilityIndex({ root });
    expect(() => compatible.page({ limit: 0 })).toThrow();
    await compatible.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("index Layer releases the live index on Scope exit", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-index-scope-"));
  try {
    const index = await Effect.runPromise(
      Effect.gen(function* () {
        const owned = yield* ObservabilityIndexService;
        expect((yield* owned.stats()).records).toBe(0);
        return owned;
      }).pipe(Effect.provide(observabilityIndexLayer({ root }))),
    );
    const closed = await Effect.runPromise(index.rebuild().pipe(Effect.flip));
    expect(closed.message).toBe("Observability index is closed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("interrupting an index scope closes its resource", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-index-interrupt-"));
  try {
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let index!: ObservabilityIndexEffects;
    const fiber = Effect.runFork(
      Effect.gen(function* () {
        index = yield* ObservabilityIndexService;
        ready();
        yield* Effect.never;
      }).pipe(Effect.provide(observabilityIndexLayer({ root }))),
    );
    await started;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect((await Effect.runPromise(index.rebuild().pipe(Effect.flip))).message).toBe(
      "Observability index is closed",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
