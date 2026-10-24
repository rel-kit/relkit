/** Finite replay preserves concurrent arrivals, current configuration and independent overflow totals. */
import { expect, test } from "vitest";
import { Effect } from "effect";
import { InspectionCapture } from "../src/connection/capture.service.js";

const record = {
  version: 2 as const,
  signal: "log" as const,
  timestamp: "2026-10-23T00:00:00.000Z",
  level: "info" as const,
  component: "app",
  message: "early",
  fields: { password: "SYNTHETIC_SECRET" },
};

test("an ACK retires only its frozen prefix while later arrivals remain redacted", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* InspectionCapture.make({});
      yield* capture.append(record);
      const first = yield* capture.records(new Request("http://localhost/v1/records"));
      yield* capture.append({ ...record, message: "later" });
      expect(yield* Effect.promise(() => first.text())).not.toContain("later");
      yield* capture.records(
        new Request("http://localhost/v1/ack", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"through":1}',
        }),
      );
      const second = yield* capture.records(new Request("http://localhost/v1/records?after=1"));
      const bytes = yield* Effect.promise(() => second.text());
      expect(bytes).toContain("later");
      expect(bytes).not.toContain("SYNTHETIC_SECRET");
      expect(
        JSON.parse(bytes).records.map((entry: { sequence: number }) => entry.sequence),
      ).toEqual([2]);
    }),
  );
});

test("default overflow retains exactly 2048 and cumulative loss survives every ACK", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* InspectionCapture.make({});
      for (let i = 0; i < 2050; i++) yield* capture.append(record);
      const response = yield* capture.records(new Request("http://localhost/v1/records"));
      expect(yield* Effect.promise(() => response.json())).toMatchObject({
        bufferedRecords: 2048,
        droppedRecords: 2,
        incomplete: true,
      });
      yield* capture.records(
        new Request("http://localhost/v1/ack", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"through":2050}',
        }),
      );
      const status = yield* capture.records(new Request("http://localhost/v1/records"));
      expect(yield* Effect.promise(() => status.json())).toMatchObject({
        bufferedRecords: 0,
        droppedRecords: 2,
        incomplete: true,
      });
    }),
  );
});

test("latest valid configuration applies immediately; invalid updates retain the accepted policy", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* InspectionCapture.make({});
      yield* capture.configure({
        redaction: { redactKeys: ["customerEmail"] },
        localRetention: { maxRecords: 1 },
      });
      expect(
        (yield* Effect.result(capture.configure({ localRetention: { maxRecords: 0 } })))._tag,
      ).toBe("Failure");
      yield* capture.append({ ...record, fields: { customerEmail: "private@example.test" } });
      yield* capture.append({ ...record, message: "newest" });
      const response = yield* capture.records(new Request("http://localhost/v1/records"));
      const bytes = yield* Effect.promise(() => response.text());
      expect(bytes).not.toContain("private@example.test");
      expect(JSON.parse(bytes)).toMatchObject({
        bufferedRecords: 1,
        droppedRecords: 1,
        records: [{ record: { message: "newest" } }],
      });
    }),
  );
});
