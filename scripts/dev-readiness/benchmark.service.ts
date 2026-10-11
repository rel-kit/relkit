/**
 * Measures a generated command through its first complete correct HTTP response.
 * The native layer is captured at acquisition and the caller's monotonic Clock
 * supplies t0 before spawning. Every child is scoped and reaped before returning.
 */
import { Cause, Clock, Context, Effect, Exit, Layer, Ref, Schedule } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { BenchmarkNative } from "./benchmark-native.service.js";
import type {
  BenchmarkChild,
  BenchmarkNativeOperations,
  ReadinessBenchmarkOperations,
  StartRequest,
  StartSample,
  StartSummary,
} from "./benchmark.types.js";

/** Measures external serving readiness using the acquired native/test adapter. */
export class ReadinessBenchmark extends Context.Service<
  ReadinessBenchmark,
  ReadinessBenchmarkOperations
>()("relkit/ReadinessBenchmark", {
  make: Effect.gen(function* () {
    const native = yield* BenchmarkNative;
    return {
      measure: Effect.fn("ReadinessBenchmark.measure")((request: StartRequest) =>
        observeExecution("testing", "dev.readiness.measure", measureStart(native, request), () => ({
          starts: 1,
        })),
      ),
    } satisfies ReadinessBenchmarkOperations;
  }),
}) {}

/** Supplies measurement policy while preserving the native authority requirement. */
export const readinessBenchmarkLive = Layer.effect(ReadinessBenchmark, ReadinessBenchmark.make);

/**
 * Retains the observed response even when its subsequent owned release fails.
 * @param native - Acquired process and response authority.
 * @param request - Exact command-to-response contract.
 * @returns Complete sample and cleanup reason classification; cancellation remains cancellation.
 */
const measureStart = Effect.fn("ReadinessBenchmark.measureStart")(function* (
  native: BenchmarkNativeOperations,
  request: StartRequest,
) {
  const observed = yield* Ref.make<StartSample | undefined>(undefined);
  const acquired = yield* Ref.make<BenchmarkChild | undefined>(undefined);
  const exit = yield* Effect.exit(
    Effect.scoped(
      Effect.gen(function* () {
        yield* native.preflight(request);
        const started = yield* Clock.monotonicTimeNanos;
        const child = yield* native.start(request);
        yield* Ref.set(acquired, child);
        const sample = yield* pollResponse(native, child, request, started).pipe(
          Effect.repeat({
            schedule: Schedule.spaced(5),
            until: (sample) => sample !== undefined,
          }),
        );
        if (sample === undefined)
          return yield* Effect.die(
            new Error("Readiness polling stopped without a terminal result"),
          );
        yield* Ref.set(observed, sample);
        return sample;
      }),
    ),
  );
  const child = yield* Ref.get(acquired);
  const output = child === undefined ? "" : yield* child.output();
  if (Exit.isSuccess(exit)) return { ...exit.value, output };
  if (Cause.hasInterrupts(exit.cause)) return yield* Effect.failCause(exit.cause);
  const sample = yield* Ref.get(observed);
  if (sample === undefined) return yield* Effect.failCause(exit.cause);
  return {
    ...sample,
    output,
    cleanupFailure: {
      reasons: exit.cause.reasons.flatMap((reason) =>
        reason._tag === "Die" && Cause.isCause(reason.defect)
          ? reason.defect.reasons.map((nested) => nested._tag)
          : [reason._tag],
      ),
    },
  };
});

/**
 * Performs one bounded observation without treating banners or sockets as success.
 * @param native - Acquired process/HTTP authority.
 * @param child - The command launched for this sample.
 * @param request - Exact expected response and finite measurement deadline.
 * @param started - Monotonic nanoseconds read before launching the command.
 * @returns A terminal sample or absence while awaiting a correct response.
 */
const pollResponse = Effect.fn("ReadinessBenchmark.poll")(function* (
  native: BenchmarkNativeOperations,
  child: BenchmarkChild,
  request: StartRequest,
  started: bigint,
) {
  const response = yield* native.probe(request.url);
  const ended = yield* Clock.monotonicTimeNanos;
  const durationMs = Number(ended - started) / 1_000_000;
  const exitCode = yield* child.exitCode();
  const output = yield* child.output();
  if (response?.status === request.expectedStatus && response.body === request.expectedBody)
    return { durationMs, outcome: "response", exitCode, output } satisfies StartSample;
  if (exitCode !== undefined)
    return { durationMs, outcome: "child-exited", exitCode, output } satisfies StartSample;
  if (durationMs >= request.deadlineMs)
    return { durationMs, outcome: "timeout", exitCode, output } satisfies StartSample;
  return undefined;
});

/**
 * Aggregates every attempt with nearest-rank p95 and a strict unrounded gate.
 * @param samples - All launches in the controlled set, without discarded warmups.
 * @param thresholdMs - Strict per-run target, normally 500 ms.
 * @returns Full-precision summary; an empty or failed set never passes.
 */
export function summarizeStarts(
  samples: readonly StartSample[],
  thresholdMs: number,
): StartSummary {
  const sorted = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return {
    runs: samples.length,
    medianMs,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
    maximumMs: sorted.at(-1) ?? 0,
    passed:
      samples.length > 0 &&
      samples.every(
        (sample) =>
          sample.outcome === "response" &&
          sample.cleanupFailure === undefined &&
          sample.exitCode === undefined &&
          sample.durationMs < thresholdMs,
      ),
  };
}
