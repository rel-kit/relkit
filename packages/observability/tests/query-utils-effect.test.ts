import { expect, test } from "vitest";
import { Effect, Metric } from "effect";
import { admitObservabilityRecord } from "../src/record-admission.js";
import { collectQueryEffect, readPageEffect } from "../src/query-page-effect.js";
import { findCursorEffect, queryIndexLayer, safeReadEffect } from "../src/query-read-effect.js";
import { findCursor, readPage, safeRead } from "../src/query-utils.js";
import type { QueryIndex } from "../src/query-utils.types.js";
import { ObservabilityQueryError } from "../src/query-types.js";
const entry = {
  cursor: "1",
  signal: "log" as const,
  segment: "logs/one",
  offset: 0,
  bytes: 32,
  timestamp: "2026-09-25T00:00:00.000Z",
};
const record = admitObservabilityRecord({
  version: 2,
  signal: "log",
  timestamp: entry.timestamp,
  level: "info",
  component: "test",
  message: "ready",
  fields: {},
});
if (!record) throw new Error("test log was not admitted");
function index(read: QueryIndex["read"] = async () => record): QueryIndex {
  return {
    page: () => ({ entries: [entry] }),
    tracePage: () => ({ entries: [entry] }),
    read,
  };
}
test("Effect query helpers use an injectable index and preserve Promise adapters", async () => {
  const source = index();
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const page = yield* readPageEffect({ search: "ready", limit: 1 }, 10, undefined, "log");
      const records = yield* collectQueryEffect({ limit: 1 }, 10, {});
      const found = yield* findCursorEffect("1", 10, "log");
      const safe = yield* safeReadEffect(entry);
      const metric = yield* Metric.value(
        Metric.counter("relkit_observability_query_pages_total", {
          attributes: { operation: "readPage", outcome: "success" },
        }),
      );
      return { page, records, found, safe, metric };
    }).pipe(
      Effect.provide(queryIndexLayer(source)),
      Effect.provideService(Metric.MetricRegistry, registry),
    ),
  );
  expect(result.page.items).toHaveLength(1);
  expect(result.records).toHaveLength(1);
  expect(result.found).toEqual(entry);
  expect(result.safe?.signal).toBe("log");
  expect(result.metric.count).toBe(2);
  expect((await readPage(source, { limit: 1 }, 10, undefined, "log")).items).toHaveLength(1);
  expect(await findCursor(source, "1", 10, "log")).toEqual(entry);
});
test("Effect read failures are tagged and Promise adapters retain original causes", async () => {
  const failure = new Error("index read failed");
  const source = index(async () => {
    throw failure;
  });
  const error = await Effect.runPromise(
    safeReadEffect(entry).pipe(Effect.flip, Effect.provide(queryIndexLayer(source))),
  );
  expect(error).toMatchObject({ _tag: "QueryReadError", reason: "index", cause: failure });
  await expect(safeRead(source, entry, undefined)).rejects.toBe(failure);
  const invalid = await Effect.runPromise(
    findCursorEffect("bad", 10, "log").pipe(Effect.flip, Effect.provide(queryIndexLayer(source))),
  );
  expect(invalid).toMatchObject({ _tag: "QueryValidationError" });
  await expect(findCursor(source, "bad", 10, "log")).rejects.toBeInstanceOf(
    ObservabilityQueryError,
  );
});
