/** Failed producer reports remain bounded, monotone and visible independently of replay ACKs. */
import { expect, test } from "vitest";
import { Effect } from "effect";
import { InspectionCapture } from "../src/connection/capture.service.js";

const source = "b2c47948-c6c1-4c40-b8dd-53ed32451a82";

/** Exercises the same authenticated inner producer route used by generated applications. */
function report(failed: number, dropped: number) {
  return new Request("http://localhost/producer-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, failed, dropped }),
  });
}

test("duplicate and older reports cannot multiply loss; one diagnostic is retained", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* InspectionCapture.make({});
      expect((yield* capture.producer(report(3, 2))).status).toBe(200);
      yield* capture.producer(report(3, 2));
      yield* capture.producer(report(1, 1));
      yield* capture.producer(report(4, 2));
      const result = yield* capture.records(
        new Request("http://localhost/_relkit/bridge/v1/records"),
      );
      expect(yield* Effect.promise(() => result.json())).toMatchObject({
        incomplete: true,
        producerFailed: 4,
        producerDropped: 2,
        records: [{ record: { component: "relkit", level: "warn" } }],
      });
    }),
  );
});

test("invalid producer counters fail before changing capture", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* InspectionCapture.make({});
      expect((yield* Effect.result(capture.producer(report(-1, 0))))._tag).toBe("Failure");
      const result = yield* capture.records(
        new Request("http://localhost/_relkit/bridge/v1/records"),
      );
      expect(yield* Effect.promise(() => result.json())).toMatchObject({
        incomplete: false,
        producerFailed: 0,
      });
    }),
  );
});
