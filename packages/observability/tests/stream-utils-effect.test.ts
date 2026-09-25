import { expect, test } from "vitest";
import { Effect, Metric } from "effect";
import {
  assertStreamTypeEffect,
  boundedStreamEffect,
  positiveStreamEffect,
  resolveCursorEffect,
  validateCursorEffect,
} from "../src/stream-utils-effect.js";
import { bounded, invalid, resolveCursor, validateCursor } from "../src/stream-utils.js";
import { ObservabilityStreamError } from "../src/stream-types.js";
test("Effect stream utilities preserve valid cursor and bound behavior", async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const cursor = yield* resolveCursorEffect({ afterCursor: "2" });
      yield* validateCursorEffect("2", 3, "2");
      const size = yield* boundedStreamEffect(100, 64, "queue");
      const positive = yield* positiveStreamEffect(8, "queue");
      const type = yield* assertStreamTypeEffect("log.emitted");
      return { cursor, size, positive, type };
    }),
  );
  expect(result).toEqual({ cursor: "2", size: 64, positive: 8, type: "log.emitted" });
  expect(resolveCursor({ cursor: "2" })).toBe("2");
  expect(bounded(100, 64, "queue")).toBe(64);
  expect(invalid("bad cursor")).toMatchObject({
    code: "RELKIT_OBSERVABILITY_STREAM_INVALID",
    message: "bad cursor",
  });
});
test("Effect stream failures are tagged and adapters retain the public error", async () => {
  for (const [value, code] of [
    ["invalid", "RELKIT_OBSERVABILITY_STREAM_INVALID"],
    ["5", "RELKIT_OBSERVABILITY_STREAM_CURSOR_FUTURE"],
    ["1", "RELKIT_OBSERVABILITY_STREAM_CURSOR_EXPIRED"],
  ] as const) {
    const error = await Effect.runPromise(validateCursorEffect(value, 4, "3").pipe(Effect.flip));
    expect(error).toMatchObject({ _tag: "StreamValidationError", code });
    expect(() => validateCursor(value, 4, "3")).toThrow(ObservabilityStreamError);
  }
  const mismatch = await Effect.runPromise(
    resolveCursorEffect({ cursor: "1", afterCursor: "2" }).pipe(Effect.flip),
  );
  expect(mismatch.code).toBe("RELKIT_OBSERVABILITY_STREAM_INVALID");
  const invalidType = await Effect.runPromise(assertStreamTypeEffect("unknown").pipe(Effect.flip));
  expect(invalidType.code).toBe("RELKIT_OBSERVABILITY_STREAM_INVALID");
});
test("Effect stream validation records bounded success and failure metrics", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      yield* positiveStreamEffect(2, "queue");
      yield* positiveStreamEffect(0, "queue").pipe(Effect.flip);
      const success = yield* Metric.value(
        Metric.counter("relkit_observability_stream_utilities_total", {
          attributes: { operation: "positive", outcome: "success" },
        }),
      );
      const failure = yield* Metric.value(
        Metric.counter("relkit_observability_stream_utilities_total", {
          attributes: { operation: "positive", outcome: "failure" },
        }),
      );
      return { success, failure };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.success.count).toBe(1);
  expect(result.failure.count).toBe(1);
});
