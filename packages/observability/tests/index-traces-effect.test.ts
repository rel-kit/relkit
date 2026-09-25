import { Effect, Metric } from "effect";
import { expect, test } from "vitest";
import { createIndexState, normalizeOptions } from "../src/storage/index-state.js";
import { readTracePage, readTracePageEffect } from "../src/storage/index-traces.js";

test("trace page Effect chooses a request representative and reports invalid cursors", async () => {
  const state = createIndexState();
  const config = normalizeOptions({});
  const base = {
    segment: "traces/2026-09-25/segment-000001.ndjson",
    offset: 0,
    bytes: 1,
    timestamp: "2026-09-25T00:00:00.000Z",
    traceId: "10000000000000000000000000000001",
  };
  state.records.set("1", { ...base, cursor: "1", signal: "span" });
  state.records.set("2", { ...base, cursor: "2", signal: "request" });
  const registry = new Map();
  const result = Effect.runSync(
    Effect.gen(function* () {
      const page = yield* readTracePageEffect(state, config, {});
      const failure = yield* readTracePageEffect(state, config, { cursor: "bad" }).pipe(
        Effect.flip,
      );
      const success = yield* Metric.value(
        Metric.counter("relkit_observability_index_trace_pages_total", {
          attributes: { outcome: "success" },
        }),
      );
      const failures = yield* Metric.value(
        Metric.counter("relkit_observability_index_trace_pages_total", {
          attributes: { outcome: "failure" },
        }),
      );
      return { page, failure, success, failures };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.page.entries).toMatchObject([{ cursor: "2", signal: "request" }]);
  expect(result.failure).toMatchObject({ _tag: "IndexTracePageError" });
  expect(result.success.count).toBe(1);
  expect(result.failures.count).toBe(1);
  expect(readTracePage(state, config, {}).entries).toEqual(result.page.entries);
  expect(() => readTracePage(state, config, { cursor: "bad" })).toThrow();
});
