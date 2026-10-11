/**
 * Verifies producer envelope bounds before memory admission and byte accounting.
 * Stable keys survive snapshots and repeated submissions for idempotent storage;
 * the redacted record and its identity are both charged to the retention budget.
 */
import { expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { EarlyRetention } from "../src/early-records.service.js";
import type { LogRecord } from "../src/model.js";

/** A finite model record containing a synthetic credential for admission checks. */
const record: LogRecord = {
  version: 2,
  signal: "log",
  timestamp: "2026-10-09T00:00:00.000Z",
  level: "info",
  component: "early.identity.test",
  message: "safe public event",
  fields: { password: "SYNTHETIC_SECRET" },
};

it.effect("counts the immutable producer envelope after redaction and preserves retry keys", () =>
  Effect.gen(function* () {
    const buffer = yield* EarlyRetention.make();
    const identity = { key: "producer:1", origin: "application" as const };
    yield* buffer.admit(record, identity);
    yield* buffer.admit(record, identity);
    const entries = yield* buffer.snapshot();
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.identity).toEqual(identity);
      expect(Object.isFrozen(entry.identity)).toBe(true);
      expect(entry.bytes).toBe(
        Buffer.byteLength(JSON.stringify({ record: entry.record, identity })),
      );
    }
    expect(JSON.stringify(entries)).not.toContain("SYNTHETIC_SECRET");
    expect((yield* buffer.status()).bufferedBytes).toBe(
      entries.reduce((sum, entry) => sum + entry.bytes, 0),
    );
  }),
);

it.effect("rejects empty and oversized keys without consuming memory or reporting false loss", () =>
  Effect.gen(function* () {
    const buffer = yield* EarlyRetention.make();
    for (const key of ["", "x".repeat(1_025)])
      expect(
        Exit.isFailure(yield* Effect.exit(buffer.admit(record, { key, origin: "application" }))),
      ).toBe(true);
    expect(yield* buffer.status()).toEqual({
      bufferedRecords: 0,
      bufferedBytes: 0,
      droppedRecords: 0,
      droppedBytes: 0,
      incomplete: false,
    });
    expect(yield* buffer.overflow()).toBeUndefined();
  }),
);
