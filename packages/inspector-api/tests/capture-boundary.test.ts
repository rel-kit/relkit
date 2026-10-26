/** The largest admitted wire envelope must be collectable and never block later replay. */
import { expect, test } from "vitest";
import { Effect } from "effect";
import { InspectionCapture } from "../src/connection/capture.service.js";

const record = (message: string) => ({
  version: 2 as const,
  signal: "log" as const,
  timestamp: "2026-10-23T00:00:00.000Z",
  level: "info" as const,
  component: "app",
  message,
  fields: {},
});
const wireBytes = (message: string) =>
  Buffer.byteLength(JSON.stringify({ sequence: 1, record: record(message) }));

test.each([0, 1] as const)(
  "exact accounted record limit plus %s byte never blocks replay",
  async (over) => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const capture = yield* InspectionCapture.make({});
        // The complete transport budget includes its 1024-byte metadata reserve and separator.
        const message = "x".repeat(1_048_576 - 1025 - wireBytes("") + over);
        expect(wireBytes(message) + 1025).toBe(1_048_576 + over);
        yield* capture.append(record(message));
        yield* capture.append(record("later"));
        const first = yield* capture.records(
          new Request("http://localhost/_relkit/bridge/v1/records"),
        );
        const body = yield* Effect.promise(() => first.text());
        expect(Buffer.byteLength(body)).toBeLessThanOrEqual(1_048_576);
        const value = JSON.parse(body) as {
          records: { sequence: number }[];
          droppedRecords: number;
          incomplete: boolean;
        };
        expect(value.records).toHaveLength(1);
        expect(value.records[0]!.sequence).toBe(over === 0 ? 1 : 2);
        expect(value.droppedRecords).toBe(over);
        expect(value.incomplete).toBe(over === 1);
        const next = yield* capture.records(
          new Request(`http://localhost/_relkit/bridge/v1/records?after=${over === 0 ? 1 : 0}`),
        );
        expect(yield* Effect.promise(() => next.json())).toMatchObject({
          records: [{ sequence: 2, record: { message: "later" } }],
        });
      }),
    );
  },
);
