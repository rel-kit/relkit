/**
 * Instruments buffer methods without emitting a log back into their own sink.
 * Calls, complete outcomes and monotonic durations remain visible standalone;
 * the support owner reports loss/failure to independent terminal/store sinks.
 */
import { Clock, Effect, Exit, Metric, Cause } from "effect";

/**
 * Observes one buffer operation while preserving its value and complete Cause.
 * @typeParam A - Successful method result.
 * @typeParam E - Expected buffer/admission failure.
 * @param operation - Fixed buffer method identity, never record data.
 * @param effect - Lazy method work, executed in the caller's runtime context.
 * @returns The original result with isolated operation metrics.
 */
export function observeEarlyRetention<A, E>(
  operation: "configure" | "admit" | "snapshot" | "status" | "acknowledge" | "overflow",
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const started = yield* Clock.monotonicTimeNanos;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const ended = yield* Clock.monotonicTimeNanos;
        const outcome = retentionOutcome(exit);
        const attributes = { operation, outcome };
        yield* Metric.update(
          Metric.counter("relkit_early_retention_operations_total", {
            incremental: true,
            attributes,
          }),
          1,
        );
        yield* Metric.update(
          Metric.histogram("relkit_early_retention_duration_ms", {
            boundaries: [0.01, 0.1, 1, 10, 100, 1000],
            attributes,
          }),
          Math.max(0, Number(ended - started) / 1_000_000),
        );
      }).pipe(Effect.catchCause(() => Effect.void)),
    );
  });
}

/**
 * Classifies a complete method result without discarding mixed Cause reasons.
 * @typeParam A - Successful operation value.
 * @typeParam E - Expected typed failure.
 * @param exit - Original method completion, before instrumentation.
 * @returns Bounded outcome label used by both operation count and duration.
 */
function retentionOutcome<A, E>(exit: Exit.Exit<A, E>) {
  if (Exit.isSuccess(exit)) return "success";
  if (Cause.hasDies(exit.cause)) return "defect";
  if (Cause.hasInterruptsOnly(exit.cause)) return "interrupted";
  return "failure";
}
