/** Two Inspectors collecting one session each keep every record until they persist it. */
import { expect, test } from "vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { InspectionCapture } from "../src/connection/capture.service.js";
import {
  CAPTURE_CONSUMER_HEADER,
  CAPTURE_CONSUMER_TTL_MS,
} from "../src/connection/capture-consumers.js";
import type { InspectionCaptureOperations } from "../src/connection/capture.types.js";

const record = {
  version: 2 as const,
  signal: "log" as const,
  timestamp: "2026-10-23T00:00:00.000Z",
  level: "info" as const,
  component: "app",
  message: "shared",
  fields: {},
};

const read = (capture: InspectionCaptureOperations, consumer: string, after: number) =>
  capture
    .records(
      new Request(`http://localhost/_relkit/bridge/v1/records?after=${after}`, {
        headers: { [CAPTURE_CONSUMER_HEADER]: consumer },
      }),
    )
    .pipe(
      Effect.flatMap((response) =>
        Effect.promise(() => response.json() as Promise<{ records: { sequence: number }[] }>),
      ),
      Effect.map((batch) => batch.records.map((entry) => entry.sequence)),
    );

const ack = (capture: InspectionCaptureOperations, consumer: string, through: number) =>
  capture.records(
    new Request("http://localhost/_relkit/bridge/v1/ack", {
      method: "POST",
      headers: { "content-type": "application/json", [CAPTURE_CONSUMER_HEADER]: consumer },
      body: JSON.stringify({ through }),
    }),
  );

test("one collector's ACK does not retire records another collector has not read", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* InspectionCapture.make({});
      yield* read(capture, "second", 0);
      for (let i = 0; i < 3; i++) yield* capture.append(record);
      expect(yield* read(capture, "first", 0)).toEqual([1, 2, 3]);
      yield* ack(capture, "first", 3);
      expect(yield* read(capture, "second", 0)).toEqual([1, 2, 3]);
      yield* ack(capture, "second", 3);
      yield* capture.append(record);
      expect(yield* read(capture, "first", 3)).toEqual([4]);
    }),
  );
});

test("a collector that stops polling expires instead of pinning the buffer", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* InspectionCapture.make({});
      yield* read(capture, "stale", 0);
      for (let i = 0; i < 2; i++) yield* capture.append(record);
      yield* TestClock.adjust(CAPTURE_CONSUMER_TTL_MS + 1);
      expect(yield* read(capture, "live", 0)).toEqual([1, 2]);
      yield* ack(capture, "live", 2);
      expect(yield* read(capture, "live", 0)).toEqual([]);
    }).pipe(Effect.provide(TestClock.layer())),
  );
});

test("an ACK beyond the latest admitted sequence is rejected", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* InspectionCapture.make({});
      yield* capture.append(record);
      const response = yield* ack(capture, "first", 5);
      expect(response.status).toBe(400);
    }).pipe(
      Effect.catchTag("InspectionConnectionError", (error) =>
        Effect.sync(() => expect(error.operation).toBe("body.cursor")),
      ),
    ),
  );
});
