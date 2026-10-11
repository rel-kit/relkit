/**
 * Exercises session retention through acquired Layers with deterministic records.
 * Tests verify memory bounds, redaction before accounting, durable loss evidence,
 * cursor fences, separate acquisition state and isolated standalone metrics.
 */
import { expect, it } from "@effect/vitest";
import { Effect, Exit, Layer, Metric } from "effect";
import { EarlyRetention, earlyRetentionLive } from "../src/early-records.service.js";
import type { LogRecord } from "../src/model.js";
import { OBSERVABILITY_MODEL_VERSION } from "../src/model.js";

/**
 * Creates a precise finite fixture containing a synthetic secret for admission.
 * @param message - Public log message used to identify order and encoded byte size.
 * @returns A model record passed through the actual redaction authority.
 */
function record(message: string): LogRecord {
  return {
    version: OBSERVABILITY_MODEL_VERSION,
    signal: "log",
    timestamp: "2026-10-09T00:00:00.000Z",
    level: "info",
    component: "early.test",
    message,
    fields: { password: "SYNTHETIC_SECRET", public: "safe" },
  };
}

it.effect("redacts before count/byte admission and evicts the oldest records", () =>
  Effect.gen(function* () {
    const buffer = yield* EarlyRetention;
    yield* buffer.admit(record("first"));
    yield* buffer.admit(record("second"));
    yield* buffer.admit(record("third"));
    const entries = yield* buffer.snapshot();
    const status = yield* buffer.status();
    expect(
      entries.map((entry) => (entry.record.signal === "log" ? entry.record.message : "")),
    ).toEqual(["second", "third"]);
    expect(JSON.stringify(entries)).not.toContain("SYNTHETIC_SECRET");
    expect(status.bufferedRecords).toBe(2);
    expect(status.bufferedBytes).toBe(entries.reduce((sum, entry) => sum + entry.bytes, 0));
    expect(
      entries.every((entry) => entry.bytes === Buffer.byteLength(JSON.stringify(entry.record))),
    ).toBe(true);
    expect(status.droppedRecords).toBe(1);
    expect(status.incomplete).toBe(true);
  }).pipe(Effect.provide(earlyRetentionLive({ maxRecords: 2 }))),
);

it.effect("counts an oversized record as loss without retaining it", () =>
  Effect.gen(function* () {
    const buffer = yield* EarlyRetention;
    const admitted = yield* buffer.admit(record("😀".repeat(500)));
    const status = yield* buffer.status();
    expect(admitted).toBeDefined();
    expect(status.bufferedRecords).toBe(0);
    expect(status.bufferedBytes).toBe(0);
    expect(status.droppedRecords).toBe(1);
    expect(status.droppedBytes).toBe(Buffer.byteLength(JSON.stringify(admitted)));
  }).pipe(Effect.provide(earlyRetentionLive({ maxBytes: 512 }))),
);

it.effect("uses the byte bound independently of its count bound", () =>
  Effect.gen(function* () {
    const buffer = yield* EarlyRetention;
    yield* buffer.admit(record("a"));
    const [first] = yield* buffer.snapshot();
    expect(first).toBeDefined();
    yield* buffer.admit(record("b"));
    yield* buffer.admit(record("c"));
    const status = yield* buffer.status();
    expect(status.bufferedBytes).toBeLessThanOrEqual(400);
    expect(status.bufferedRecords).toBeLessThan(3);
    expect(status.droppedRecords).toBeGreaterThan(0);
  }).pipe(Effect.provide(earlyRetentionLive({ maxRecords: 100, maxBytes: 400 }))),
);

it.effect("enforces the default two MiB byte bound before the count bound", () =>
  Effect.gen(function* () {
    const buffer = yield* EarlyRetention;
    yield* Effect.forEach([0, 1, 2], () => buffer.admit(record("x".repeat(900_000))));
    const status = yield* buffer.status();
    expect(status.bufferedRecords).toBe(2);
    expect(status.bufferedBytes).toBeLessThanOrEqual(2_097_152);
    expect(status.droppedRecords).toBe(1);
    expect(status.droppedBytes).toBeGreaterThan(900_000);
  }).pipe(Effect.provide(earlyRetentionLive())),
);

it.effect("coalesces loss outside a saturated buffer and keeps loss after handoff", () =>
  Effect.gen(function* () {
    const buffer = yield* EarlyRetention;
    yield* buffer.admit(record("first"));
    yield* buffer.admit(record("second"));
    expect((yield* buffer.overflow())?.code).toBe("RELKIT_EARLY_TELEMETRY_OVERFLOW");
    expect(yield* buffer.overflow()).toBeUndefined();
    const [entry] = yield* buffer.snapshot();
    if (entry === undefined) return yield* Effect.die(new Error("Expected retained record"));
    yield* buffer.acknowledge(entry.sequence);
    expect((yield* buffer.status()).droppedRecords).toBe(1);
    yield* buffer.admit(record("third"));
    yield* buffer.admit(record("fourth"));
    expect((yield* buffer.overflow())?.message).toContain("2 records");
    expect((yield* buffer.snapshot()).length).toBe(1);
  }).pipe(Effect.provide(earlyRetentionLive({ maxRecords: 1 }))),
);

it.effect("acknowledges only a captured prefix and rejects future/invalid cursors", () =>
  Effect.gen(function* () {
    const buffer = yield* EarlyRetention;
    yield* buffer.admit(record("before"));
    const [captured] = yield* buffer.snapshot();
    if (captured === undefined) return yield* Effect.die(new Error("Expected captured record"));
    yield* buffer.admit(record("after"));
    yield* buffer.acknowledge(captured.sequence);
    expect((yield* buffer.snapshot()).map((entry) => entry.sequence)).toEqual([2]);
    for (const cursor of [-1, 0.5, 3, Number.NaN]) {
      const exit = yield* Effect.exit(buffer.acknowledge(cursor));
      expect(Exit.isFailure(exit)).toBe(true);
    }
    expect((yield* buffer.snapshot()).map((entry) => entry.sequence)).toEqual([2]);
  }).pipe(Effect.provide(earlyRetentionLive())),
);

it.effect("enforces acquisition bounds and isolates state between Layers", () =>
  Effect.gen(function* () {
    for (const options of [
      { maxRecords: 0 },
      { maxRecords: 65_537 },
      { maxBytes: 0 },
      { maxBytes: 67_108_865 },
    ])
      expect(Exit.isFailure(yield* Effect.exit(EarlyRetention.make(options)))).toBe(true);
    const first = yield* EarlyRetention.make();
    const second = yield* EarlyRetention.make();
    yield* first.admit(record("session one"));
    expect((yield* second.status()).bufferedRecords).toBe(0);
  }),
);

it.effect("applies changed bounds and redaction to subsequent admissions", () =>
  Effect.gen(function* () {
    const buffer = yield* EarlyRetention.make({ maxRecords: 3 });
    yield* buffer.admit(record("first"));
    yield* buffer.admit(record("second"));
    yield* buffer.configure({ maxRecords: 1, redaction: { redactKeys: ["public"] } });
    expect((yield* buffer.snapshot()).map((entry) => entry.sequence)).toEqual([2]);
    yield* buffer.admit(record("third"));
    const [latest] = yield* buffer.snapshot();
    expect(latest?.sequence).toBe(3);
    expect(JSON.stringify(latest)).not.toContain('"public":"safe"');
    expect((yield* buffer.status()).droppedRecords).toBe(2);
  }),
);

it.effect("records one standalone outcome without sending observation logs to itself", () =>
  Effect.gen(function* () {
    const buffer = yield* EarlyRetention;
    yield* buffer.admit(record("observed"));
    const count = yield* Metric.value(
      Metric.counter("relkit_early_retention_operations_total", {
        incremental: true,
        attributes: { operation: "admit", outcome: "success" },
      }),
    );
    expect(count.count).toBe(1);
    expect((yield* buffer.snapshot()).length).toBe(1);
  }).pipe(
    Effect.provide(earlyRetentionLive()),
    Effect.provide(Layer.succeed(Metric.MetricRegistry, new Map())),
  ),
);
