import { join } from "node:path";
import { Effect, Metric } from "effect";
import { expect, test } from "vitest";
import {
  assertEntry,
  assertIndexEntryEffect,
  boundedIndexLimitEffect,
  boundedLimit,
  createIndexState,
  createIndexStateEffect,
  indexTimestampEffect,
  makeEntry,
  makeIndexEntryEffect,
  matches,
  matchesIndexEntryEffect,
  normalizeIndexOptionsEffect,
  normalizeOptions,
  optionalIndexTextEffect,
  optionalText,
  parseCursor,
  parseIndexCursorEffect,
  safeIndexSegmentPathEffect,
  safeSegmentPath,
  timestampFor,
  timestampMs,
  timestampMsEffect,
} from "../src/storage/index-state.js";
const record = {
  version: 2 as const,
  signal: "log" as const,
  timestamp: "2026-09-25T00:00:00.000Z",
  level: "info" as const,
  component: "test",
  message: "hello",
  fields: {},
};
test("index state Effect operations build validated entries and emit bounded metrics", () => {
  const registry = new Map();
  const result = Effect.runSync(
    Effect.gen(function* () {
      const state = yield* createIndexStateEffect();
      const config = yield* normalizeIndexOptionsEffect({ maxEntries: 100 });
      const entry = yield* makeIndexEntryEffect(record, "logs/day/file", 0, 10, 1);
      yield* assertIndexEntryEffect(record, 0, 10);
      const timestamp = yield* indexTimestampEffect(record);
      const millis = yield* timestampMsEffect(timestamp);
      const invalidMillis = yield* timestampMsEffect("bad");
      const optional = yield* optionalIndexTextEffect({ traceId: "trace" }, "traceId");
      const limit = yield* boundedIndexLimitEffect(200, 20, 100);
      const cursor = yield* parseIndexCursorEffect("2");
      const path = yield* safeIndexSegmentPathEffect("/tmp", "logs/day/file");
      const match = yield* matchesIndexEntryEffect(entry, { signal: "log" });
      const failure = yield* parseIndexCursorEffect("bad").pipe(Effect.flip);
      const successCount = yield* Metric.value(
        Metric.counter("relkit_observability_index_state_total", {
          attributes: { operation: "parseCursor", outcome: "success" },
        }),
      );
      const failureCount = yield* Metric.value(
        Metric.counter("relkit_observability_index_state_total", {
          attributes: { operation: "parseCursor", outcome: "failure" },
        }),
      );
      return {
        state,
        config,
        entry,
        timestamp,
        millis,
        invalidMillis,
        optional,
        limit,
        cursor,
        path,
        match,
        failure,
        successCount,
        failureCount,
      };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.state.records.size).toBe(0);
  expect(result.config.maxEntries).toBe(100);
  expect(result.entry).toMatchObject({ cursor: "1", signal: "log" });
  expect(result.timestamp).toBe(record.timestamp);
  expect(result.millis).toBe(Date.parse(record.timestamp));
  expect(result.invalidMillis).toBeUndefined();
  expect(result.optional).toEqual({ traceId: "trace" });
  expect(result.limit).toBe(100);
  expect(result.cursor).toBe(2);
  expect(result.path).toBe(join("/tmp", "logs/day/file"));
  expect(result.match).toBe(true);
  expect(result.failure).toMatchObject({ _tag: "IndexStateError", operation: "parseCursor" });
  expect(result.successCount.count).toBe(1);
  expect(result.failureCount.count).toBe(1);
});
test("index state compatibility adapters preserve values and validation errors", () => {
  expect(createIndexState().records.size).toBe(0);
  expect(normalizeOptions({ maxEntries: 100 }).maxEntries).toBe(100);
  const entry = makeEntry(record, "logs/day/file", 0, 10, 1);
  assertEntry(record, 0, 10);
  expect(timestampFor(record)).toBe(record.timestamp);
  expect(timestampMs(record.timestamp)).toBe(Date.parse(record.timestamp));
  expect(optionalText({ traceId: "trace" }, "traceId")).toEqual({ traceId: "trace" });
  expect(boundedLimit(200, 20, 100)).toBe(100);
  expect(parseCursor("2")).toBe(2);
  expect(safeSegmentPath("/tmp", "logs/day/file")).toBe(join("/tmp", "logs/day/file"));
  expect(matches(entry, { signal: "log" })).toBe(true);
  expect(() => parseCursor("bad")).toThrow(TypeError);
  expect(() => normalizeOptions({ maxEntries: 0 })).toThrow(TypeError);
  expect(() => assertEntry(record, 0, 0)).toThrow(TypeError);
  expect(() => safeSegmentPath("/tmp", "../escape")).toThrow(TypeError);
});
