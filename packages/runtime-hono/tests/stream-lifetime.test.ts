import { expect, it } from "@effect/vitest";
import { Effect, Fiber, Stream } from "effect";
import { TestClock } from "effect/testing";
import { createLoggerLayer, type LogRecord } from "@relkit/runtime-effect";
import { observeHttpStream } from "../src/http-stream-observation.js";
import { httpIterable } from "../src/http-effect.js";

it.effect("observes one terminal outcome across all stream pulls", () => {
  const records: LogRecord[] = [];
  return Effect.gen(function* () {
    yield* observeHttpStream("fixture.observation", Stream.make(1, 2)).pipe(Stream.runCollect);
    yield* observeHttpStream("fixture.observation", Stream.fail("denied")).pipe(
      Stream.runCollect,
      Effect.result,
    );
    yield* observeHttpStream("fixture.observation", Stream.make(1, 2)).pipe(
      Stream.take(1),
      Stream.runCollect,
    );
    expect(
      records
        .filter((record) => record.fields.operation === "fixture.observation")
        .map((record) => record.fields.outcome),
    ).toEqual(["success", "failure", "interrupted"]);
  }).pipe(
    Effect.provide(
      createLoggerLayer({
        minimumLevel: "debug",
        human: false,
        json: { write: (record) => records.push(record) },
      }),
    ),
  );
});

it.effect("measures stream lifetime with the injected clock", () => {
  const records: LogRecord[] = [];
  return Effect.gen(function* () {
    const fiber = yield* observeHttpStream(
      "fixture.observation.duration",
      Stream.fromEffect(Effect.sleep(25)),
    ).pipe(Stream.runDrain, Effect.forkChild);
    yield* TestClock.adjust(25);
    yield* Fiber.join(fiber);
    expect(
      records.find((record) => record.fields.operation === "fixture.observation.duration")?.fields
        .duration_ms,
    ).toBe(25);
  }).pipe(
    Effect.provide(
      createLoggerLayer({ human: false, json: { write: (record) => records.push(record) } }),
    ),
  );
});

it("returns an iterator while its next call is blocked and joins cleanup", async () => {
  let finalized = false;
  const iterator = httpIterable(
    Stream.fromEffect(Effect.never).pipe(
      Stream.ensuring(
        Effect.sync(() => {
          finalized = true;
        }),
      ),
    ),
  );
  const pending = iterator.next();
  await Promise.resolve();
  await iterator.return?.();
  await pending;
  expect(finalized).toBe(true);
});
