/** Exact default and configured limits are observed independently from transport batches. */
import { expect, test } from "vitest";
import { Effect } from "effect";
import { EarlyRetention } from "../src/early-records.service.js";

const record = (message: string) => ({
  version: 2 as const,
  signal: "log" as const,
  timestamp: "2026-10-23T00:00:00.000Z",
  level: "info" as const,
  component: "bounds",
  message,
  fields: {},
});

/** Accounts complete UTF-8 retention envelopes without reading implementation counters. */
function sized(sequence: number, bytes: number) {
  const overhead = Buffer.byteLength(JSON.stringify({ sequence, record: record("") }));
  return record("x".repeat(bytes - overhead));
}

test("default count accepts 2,048, then evicts exactly one without hitting the byte bound", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const buffer = yield* EarlyRetention.make();
      for (let i = 1; i <= 2048; i++) yield* buffer.admit(record(String(i)));
      expect(yield* buffer.status()).toMatchObject({ bufferedRecords: 2048, droppedRecords: 0 });
      yield* buffer.admit(record("one over"));
      const entries = yield* buffer.snapshot();
      expect(entries[0]!.sequence).toBe(2);
      const bytes = entries.reduce(
        (sum, entry) =>
          sum +
          Buffer.byteLength(JSON.stringify({ sequence: entry.sequence, record: entry.record })),
        0,
      );
      expect(bytes).toBeLessThan(2_097_152);
      expect(yield* buffer.status()).toMatchObject({
        bufferedRecords: 2048,
        bufferedBytes: bytes,
        droppedRecords: 1,
      });
    }),
  );
});

test.each([0, 1])(
  "default two MiB plus %s byte enforces bytes independently of count",
  async (over) => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const buffer = yield* EarlyRetention.make();
        yield* buffer.admit(sized(1, 700_000));
        yield* buffer.admit(sized(2, 700_000));
        yield* buffer.admit(sized(3, 697_152 + over));
        expect(yield* buffer.status()).toMatchObject({
          bufferedRecords: over === 0 ? 3 : 2,
          bufferedBytes: 2_097_152 + over - (over === 0 ? 0 : 700_000),
          droppedRecords: over,
          droppedBytes: over === 0 ? 0 : 700_000,
        });
      }),
    );
  },
);

test("configured ceilings are inclusive and cannot be raised by one", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const maximum = yield* EarlyRetention.make({ maxRecords: 65_536, maxBytes: 67_108_864 });
      expect((yield* maximum.status()).bufferedRecords).toBe(0);
      for (const options of [{ maxRecords: 65_537 }, { maxBytes: 67_108_865 }])
        expect((yield* Effect.result(EarlyRetention.make(options)))._tag).toBe("Failure");
    }),
  );
});
