import { join } from "node:path";
import { Effect, Metric } from "effect";
import { expect, test } from "vitest";
import { admitObservabilityRecord } from "../src/record-admission.js";
import {
  addIndexLineEffect,
  addIndexRecordEffect,
  addIndexSegmentEffect,
  addLine,
  addRecord,
  addSegment,
  indexMemoryStatsEffect,
  readIndexPageEffect,
  readPage,
  removeEntry,
  removeIndexEntryEffect,
  renameIndexSegmentEffect,
  renameSegment,
  stats,
  trimEntries,
  trimIndexEntriesEffect,
} from "../src/storage/index-memory.js";
import { createIndexState, normalizeOptions } from "../src/storage/index-state.js";

const record = admitObservabilityRecord({
  version: 2,
  signal: "log",
  timestamp: "2026-09-25T00:00:00.000Z",
  level: "info",
  component: "test",
  message: "hello",
  fields: {},
})!;
const root = "/tmp/relkit-index-memory";
const active = join(root, "logs/day/segment-000001.active.ndjson");
const final = join(root, "logs/day/segment-000001.ndjson");
const scan = { path: active, directory: "logs" as const, active: true, bytes: 0 };

test("index memory Effects update entries and report typed page failures", () => {
  const state = createIndexState();
  const config = normalizeOptions({ pageSize: 1 });
  const registry = new Map();
  const result = Effect.runSync(
    Effect.gen(function* () {
      yield* addIndexSegmentEffect(state, scan);
      const first = yield* addIndexRecordEffect(state, root, record, active, 0, 10);
      yield* addIndexLineEffect(state, root, { segment: scan, record, offset: 10, bytes: 10 });
      const page = yield* readIndexPageEffect(state, config, { limit: 1 });
      const before = yield* indexMemoryStatsEffect(state);
      yield* renameIndexSegmentEffect(state, root, active, final);
      yield* removeIndexEntryEffect(state, root, first.cursor);
      yield* trimIndexEntriesEffect(state, root, 0);
      const after = yield* indexMemoryStatsEffect(state);
      const failure = yield* readIndexPageEffect(state, config, { cursor: "bad" }).pipe(
        Effect.flip,
      );
      const failures = yield* Metric.value(
        Metric.counter("relkit_observability_index_memory_total", {
          attributes: { operation: "readPage", outcome: "failure" },
        }),
      );
      return { first, page, before, after, failure, failures };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.first.cursor).toBe("1");
  expect(result.page.entries).toMatchObject([{ cursor: "1" }]);
  expect(result.page.nextCursor).toBe("1");
  expect(result.before.records).toBe(2);
  expect(result.after.records).toBe(0);
  expect(state.segments.has(final)).toBe(true);
  expect(result.failure).toMatchObject({ _tag: "IndexMemoryError", operation: "readPage" });
  expect(result.failures.count).toBe(1);
});

test("index memory adapters delegate all mutable operations", () => {
  const state = createIndexState();
  const config = normalizeOptions({});
  addSegment(state, scan);
  const first = addRecord(state, root, record, active, 0, 10);
  addLine(state, root, { segment: scan, record, offset: 10, bytes: 10 });
  expect(readPage(state, config, {}).entries).toHaveLength(2);
  expect(stats(state).records).toBe(2);
  renameSegment(state, root, active, final);
  removeEntry(state, root, first.cursor);
  trimEntries(state, root, 0);
  expect(stats(state).records).toBe(0);
  expect(() => readPage(state, config, { cursor: "bad" })).toThrow(TypeError);
});
