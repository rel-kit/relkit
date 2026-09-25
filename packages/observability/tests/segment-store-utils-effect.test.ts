import { Effect, Metric } from "effect";
import { expect, test } from "vitest";
import {
  dayFor,
  dayForEffect,
  isRecordForSignal,
  isRecordForSignalEffect,
  positive,
  positiveSegmentBoundEffect,
} from "../src/storage/segment-store-utils.js";
import type { ObservabilityRecord } from "../src/model.js";
const record = {
  version: 2,
  signal: "log",
  timestamp: "2026-09-25T00:01:02.000Z",
} as ObservabilityRecord;
test("segment utilities expose typed validation, compatibility, and metrics", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const bound = yield* positiveSegmentBoundEffect(4);
      const day = yield* dayForEffect(record);
      const matches = yield* isRecordForSignalEffect(record, "log");
      const failure = yield* positiveSegmentBoundEffect(0).pipe(Effect.flip);
      const successes = yield* Metric.value(
        Metric.counter("relkit_observability_segment_utility_total", {
          attributes: { operation: "positive", outcome: "success" },
        }),
      );
      const failures = yield* Metric.value(
        Metric.counter("relkit_observability_segment_utility_total", {
          attributes: { operation: "positive", outcome: "failure" },
        }),
      );
      return { bound, day, matches, failure, successes, failures };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result).toMatchObject({ bound: 4, day: "2026-09-25", matches: true });
  expect(result.failure).toMatchObject({ _tag: "SegmentUtilityError", operation: "positive" });
  expect(result.successes.count).toBe(1);
  expect(result.failures.count).toBe(1);
  expect(positive(4)).toBe(4);
  expect(dayFor(record)).toBe("2026-09-25");
  expect(isRecordForSignal(record, "log")).toBe(true);
  expect(() => positive(0)).toThrow(TypeError);
  expect(() => dayFor({ ...record, timestamp: "invalid" })).toThrow(TypeError);
});
