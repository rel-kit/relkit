/**
 * Proves the external timer includes process acquisition and complete HTTP bytes.
 * A supplied native layer and monotonic clock model failed responses and child
 * ownership without sleeps or module mocks. Every measured scope must release.
 */
import { expect, it } from "@effect/vitest";
import { Cause, Clock, Effect, Layer, Ref } from "effect";
import { BenchmarkNative } from "../../dev-readiness/benchmark-native.service.js";
import {
  ReadinessBenchmark,
  readinessBenchmarkLive,
  summarizeStarts,
} from "../../dev-readiness/benchmark.service.js";
import type { StartRequest } from "../../dev-readiness/benchmark.types.js";

const request: StartRequest = {
  projectRoot: "/generated-project",
  environment: {},
  url: "http://127.0.0.1:12345/hello",
  expectedStatus: 200,
  expectedBody: '{"message":"Hello, RelKit!"}',
  deadlineMs: 500,
};

/**
 * Supplies one clock/native graph with observable acquisition and release.
 * @param body - Complete fake response bytes, including wrong-response cases.
 * @param elapsedMs - Total clock advancement after spawn and response body.
 * @returns A single measurement and ownership observations.
 */
const measure = Effect.fn("ReadinessBenchmark.Test.measure")(function* (
  body: string,
  elapsedMs: number,
  cleanupCause?: Cause.Cause<Error>,
) {
  const nanos = yield* Ref.make(0n);
  const released = yield* Ref.make(false);
  const started = yield* Ref.make(false);
  const output = yield* Ref.make("Ready in 1 ms");
  const native = Layer.succeed(BenchmarkNative, {
    preflight: () => Effect.sync(() => expect(Ref.getUnsafe(started)).toBe(false)),
    start: () =>
      Effect.acquireRelease(
        Ref.set(started, true).pipe(
          Effect.andThen(Ref.set(nanos, 100_000_000n)),
          Effect.as({
            exitCode: () => Effect.succeed(undefined),
            output: () => Ref.get(output),
          }),
        ),
        () =>
          Ref.set(released, true).pipe(
            Effect.andThen(Ref.set(output, "Ready in 1 ms\nshutdown joined")),
            Effect.andThen(cleanupCause === undefined ? Effect.void : Effect.die(cleanupCause)),
          ),
      ),
    probe: () =>
      Ref.set(nanos, BigInt(elapsedMs) * 1_000_000n).pipe(Effect.as({ status: 200, body })),
    report: () => Effect.void,
  });
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => 0,
    currentTimeMillis: Effect.succeed(0),
    currentTimeNanosUnsafe: () => Ref.getUnsafe(nanos),
    currentTimeNanos: Ref.get(nanos),
    monotonicTimeNanosUnsafe: () => Ref.getUnsafe(nanos),
    monotonicTimeNanos: Ref.get(nanos),
    sleep: () => Effect.void,
  };
  const sample = yield* Effect.gen(function* () {
    return yield* (yield* ReadinessBenchmark).measure(request);
  }).pipe(
    Effect.provide(readinessBenchmarkLive.pipe(Layer.provide(native))),
    Effect.provideService(Clock.Clock, clock),
  );
  return { sample, started: yield* Ref.get(started), released: yield* Ref.get(released) };
});

it.effect("includes spawning and HTTP body observation before scoped cleanup", () =>
  Effect.gen(function* () {
    const result = yield* measure(request.expectedBody, 300);
    expect(result.sample.durationMs).toBe(300);
    expect(result.sample.outcome).toBe("response");
    expect(result.started).toBe(true);
    expect(result.released).toBe(true);
    expect(result.sample.output).toContain("shutdown joined");
  }),
);

it.effect("a ready banner and wrong successful HTTP body do not pass", () =>
  Effect.gen(function* () {
    const result = yield* measure('{"ready":true}', 500);
    expect(result.sample.outcome).toBe("timeout");
    expect(result.released).toBe(true);
    expect(summarizeStarts([result.sample], 500).passed).toBe(false);
  }),
);

it.effect("the gate is strict and never rounds 500 ms down", () =>
  Effect.gen(function* () {
    const fast = yield* measure(request.expectedBody, 499);
    const boundary = yield* measure(request.expectedBody, 500);
    expect(summarizeStarts([fast.sample], 500).passed).toBe(true);
    expect(summarizeStarts([fast.sample, boundary.sample], 500).passed).toBe(false);
  }),
);

it.effect("retains a correct response and every cleanup reason when physical release fails", () =>
  Effect.gen(function* () {
    const cause = Cause.combine(
      Cause.fail(new Error("reap failed")),
      Cause.die(new Error("release defect")),
    );
    const result = yield* measure(request.expectedBody, 300, cause);
    expect(result.sample.durationMs).toBe(300);
    expect(result.sample.outcome).toBe("response");
    expect(result.sample.output).toBe("Ready in 1 ms\nshutdown joined");
    expect(result.sample.cleanupFailure?.reasons).toEqual(["Fail", "Die"]);
    expect(result.released).toBe(true);
    expect(summarizeStarts([result.sample], 500).passed).toBe(false);
  }),
);

it.effect("summary includes every launch and uses nearest-rank p95", () =>
  Effect.sync(() => {
    const samples = Array.from({ length: 20 }, (_, index) => ({
      durationMs: index + 1,
      outcome: "response" as const,
      exitCode: undefined,
      output: "",
    }));
    expect(summarizeStarts(samples, 500)).toEqual({
      runs: 20,
      medianMs: 10.5,
      p95Ms: 19,
      maximumMs: 20,
      passed: true,
    });
    expect(summarizeStarts([], 500).passed).toBe(false);
  }),
);
