/** Tests bounded redacted capture and durable-ACK admission independently of storage. */
import { expect, test } from "vitest";
import { Effect } from "effect";
import { InspectionCapture } from "../src/connection/capture.service.js";

/** Supplies a valid record with a secret which must be removed before retention. */
function record(message: string) {
  return {
    version: 2 as const,
    signal: "log" as const,
    timestamp: "2026-10-23T00:00:00.000Z",
    level: "info" as const,
    component: "app",
    message,
    fields: { password: "never-retain-this" },
  };
}

test("redacts before retention, replays stable sequences and retires only acknowledged prefixes", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* InspectionCapture.make({});
      const identity = { key: "producer:1", origin: "application" as const };
      yield* capture.append(record("one"), identity);
      yield* capture.append(record("one"), identity);
      yield* capture.append(record("two"));
      const replay = yield* capture.records(
        new Request("http://localhost/_relkit/bridge/v1/records?after=0"),
      );
      const bytes = yield* Effect.promise(() => replay.text());
      expect(bytes).not.toContain("never-retain-this");
      expect(
        JSON.parse(bytes).records.map((entry: { sequence: number }) => entry.sequence),
      ).toEqual([1, 2]);
      yield* capture.records(
        new Request("http://localhost/_relkit/bridge/v1/ack", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"through":1}',
        }),
      );
      const after = yield* capture.records(
        new Request("http://localhost/_relkit/bridge/v1/records?after=0"),
      );
      expect(yield* Effect.promise(() => after.json())).toMatchObject({
        records: [{ sequence: 2 }],
        gap: true,
      });
    }),
  );
});

test("count overflow is explicit and batches stay within their byte ceiling", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* InspectionCapture.make({ localRetention: { maxRecords: 2 } });
      for (let i = 0; i < 3; i++) yield* capture.append(record(String(i)));
      const response = yield* capture.records(
        new Request("http://localhost/_relkit/bridge/v1/records"),
      );
      const bytes = yield* Effect.promise(() => response.text());
      expect(Buffer.byteLength(bytes)).toBeLessThanOrEqual(1_048_576);
      expect(JSON.parse(bytes)).toMatchObject({ gap: true, droppedRecords: 1, incomplete: true });
    }),
  );
});

test("oversized records become loss instead of blocking all later replay", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* InspectionCapture.make({});
      yield* capture.append(record("x".repeat(1_048_576)));
      yield* capture.append(record("after oversized"));
      const response = yield* capture.records(
        new Request("http://localhost/_relkit/bridge/v1/records"),
      );
      expect(yield* Effect.promise(() => response.json())).toMatchObject({
        records: [{ sequence: 2 }],
        droppedRecords: 1,
        incomplete: true,
      });
    }),
  );
});
