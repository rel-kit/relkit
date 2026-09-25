import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Metric } from "effect";
import { expect, test } from "vitest";
import { enforceRetention, enforceRetentionEffect } from "../src/storage/index-retention.js";
import { createIndexState, normalizeOptions } from "../src/storage/index-state.js";

test("retention Effect removes expired segments and reports tagged clock failures", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-retention-effect-"));
  try {
    const path = join(root, "segment.ndjson");
    await writeFile(path, "record\n");
    const state = createIndexState();
    state.segments.set(path, {
      path,
      active: false,
      bytes: 7,
      oldest: 0,
      newest: 0,
      entries: new Set(),
    });
    const config = normalizeOptions({ now: () => 1_000, maxAgeMs: 100 });
    const registry = new Map();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const report = yield* enforceRetentionEffect(root, state, config);
        const failure = yield* enforceRetentionEffect(
          root,
          state,
          normalizeOptions({ now: () => Number.NaN }),
        ).pipe(Effect.flip);
        const success = yield* Metric.value(
          Metric.counter("relkit_observability_index_retention_total", {
            attributes: { outcome: "success" },
          }),
        );
        const failures = yield* Metric.value(
          Metric.counter("relkit_observability_index_retention_total", {
            attributes: { outcome: "failure" },
          }),
        );
        return { report, failure, success, failures };
      }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
    );
    expect(result.report).toEqual({ removedSegments: 1, removedRecords: 0, removedBytes: 7 });
    expect(state.segments.size).toBe(0);
    expect(result.failure).toMatchObject({ _tag: "IndexRetentionError" });
    expect(result.success.count).toBe(1);
    expect(result.failures.count).toBe(1);
    await expect(
      enforceRetention(root, state, normalizeOptions({ now: () => Number.NaN })),
    ).rejects.toThrow(TypeError);
    expect(await enforceRetention(root, state, config)).toEqual({
      removedSegments: 0,
      removedRecords: 0,
      removedBytes: 0,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
