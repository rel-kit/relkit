import { Cause, Clock, Effect, Exit, Metric } from "effect";
import type { JobsOperation, JobsWorkload } from "./observability.types.js";

/** Each execution is counted once per fixed operation label, including standalone calls. */
const calls = Metric.counter("relkit_compiler_jobs_operations_total", { incremental: true });

/** Completion counts distinguish expected failures, defects, and cancellation. */
const outcomes = Metric.counter("relkit_compiler_jobs_outcomes_total", { incremental: true });

/** Monotonic elapsed milliseconds, recorded once even when a stage fails. */
const duration = Metric.histogram("relkit_compiler_jobs_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100, 1000],
});

/**
 * Observes a jobs operation in its supplied runtime without changing any Effect channel.
 * @typeParam A - Successful stage result.
 * @typeParam E - Expected stage failures.
 * @typeParam R - Caller-provided stage dependencies.
 * @param operation - Fixed stage label used for metrics, span attributes, and logs.
 * @param effect - Lazy stage body; named Effect.fn supplies its enclosing span.
 * @param inputWorkload - Optional lazy counts of inputs inspected by this operation.
 * @param outputWorkload - Optional counts of the successful result emitted by this operation.
 * @returns A lazy effect retaining the result, failures, defects, interruption, and dependencies.
 * @remarks Each operation owns its own series; nested labels are not an aggregate stage count.
 * Logs contain bounded operation/outcome labels and durations, never descriptor values, paths, or payloads.
 */
export function observeJobs<A, E, R>(
  operation: JobsOperation,
  effect: Effect.Effect<A, E, R>,
  inputWorkload?: () => JobsWorkload,
  outputWorkload?: (result: A) => JobsWorkload,
): Effect.Effect<A, E, R> {
  const attributes = { operation };
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("compiler.jobs.operation", operation);
    const started = yield* Clock.monotonicTimeNanos;
    yield* Metric.update(Metric.withAttributes(calls, attributes), 1);
    const body = Effect.gen(function* () {
      if (inputWorkload !== undefined) yield* recordJobsWorkload(operation, inputWorkload());
      const result = yield* effect;
      if (outputWorkload !== undefined)
        yield* recordJobsWorkload(operation, outputWorkload(result));
      return result;
    });
    return yield* Effect.onExit(body, (exit) =>
      Effect.gen(function* () {
        const outcome = Exit.isSuccess(exit)
          ? "success"
          : Cause.hasInterrupts(exit.cause)
            ? "interrupted"
            : Cause.hasDies(exit.cause)
              ? "defect"
              : "failure";
        const elapsed = Number((yield* Clock.monotonicTimeNanos) - started) / 1_000_000;
        yield* Metric.update(Metric.withAttributes(duration, attributes), Math.max(0, elapsed));
        yield* Metric.update(Metric.withAttributes(outcomes, { operation, outcome }), 1);
        yield* Effect.annotateCurrentSpan("compiler.jobs.outcome", outcome);
        yield* Effect.annotateCurrentSpan("compiler.jobs.duration_ms", Math.max(0, elapsed));
        yield* Effect.annotateLogs(
          outcome === "success" || outcome === "interrupted"
            ? Effect.logDebug("Compiler jobs operation completed")
            : Effect.logWarning("Compiler jobs operation failed"),
          { "compiler.stage": "jobs", operation, outcome, duration_ms: Math.max(0, elapsed) },
        );
      }),
    );
  });
}

/** Items inspected or emitted per operation; separate labels prevent nested-call double counting. */
const workload = Metric.counter("relkit_compiler_jobs_workload_total", { incremental: true });

/**
 * Records bounded workload counts on the current stage span and metric registry.
 * @param operation - Fixed compiler stage label.
 * @param counts - Counts of inspected descriptors, diagnostics, or emitted artifacts.
 * @returns A lazy effect recording each supplied non-negative count.
 */
export function recordJobsWorkload(
  operation: JobsOperation,
  counts: JobsWorkload,
): Effect.Effect<void> {
  // Instrumentation belongs to the domain span, so this utility creates no child span.
  return Effect.gen(function* () {
    yield* Effect.forEach(
      Object.entries(counts),
      ([kind, count]) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan(`compiler.jobs.${kind}`, count);
          yield* Metric.update(Metric.withAttributes(workload, { operation, kind }), count);
        }),
      { discard: true },
    );
  });
}
