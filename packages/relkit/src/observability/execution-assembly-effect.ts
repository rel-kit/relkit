import { Clock, Duration, Effect, Exit, Metric } from "effect";
import type { ObservabilityRecord, SpanRecord, TraceRecord } from "./model.js";
import type { RequestExecutionDetail } from "./execution-assembly.types.js";
import { executionAssemblyCore as core } from "./execution-assembly-core.js";
function observe<A>(
  operation: "assemble" | "coalesceSpans" | "currentTrace",
  effect: Effect.Effect<A>,
): Effect.Effect<A> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_execution_assembly_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_execution_assembly_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
/**
 * Assembles bounded request execution detail in Effect.
 * @param records - Candidate execution records.
 * @param requestId - Request identity.
 * @returns An Effect with immutable detail or undefined; malformed records can defect.
 * @example
 * const detail = Effect.runSync(assembleRequestExecutionEffect(records, requestId));
 */
export const assembleRequestExecutionEffect = Effect.fn("ObservabilityExecution.assemble")(
  (
    records: readonly ObservabilityRecord[],
    requestId: string,
  ): Effect.Effect<RequestExecutionDetail | undefined> =>
    observe(
      "assemble",
      Effect.sync(() => core.assembleRequestExecution(records, requestId)),
    ),
);
/**
 * Keeps the latest lifecycle revision for each span identity.
 * @param spans - Span lifecycle records.
 * @returns An Effect with spans ordered by start time.
 * @example
 * const current = Effect.runSync(coalesceSpansEffect(spans));
 */
export const coalesceSpansEffect = Effect.fn("ObservabilityExecution.coalesceSpans")(
  (spans: readonly SpanRecord[]): Effect.Effect<SpanRecord[]> =>
    observe(
      "coalesceSpans",
      Effect.sync(() => core.coalesceSpans(spans)),
    ),
);
/**
 * Combines current spans with the latest trace record.
 * @param spans - Span lifecycle records.
 * @param traces - Trace records in chronological order.
 * @returns An Effect with current spans and optional latest trace.
 * @example
 * const current = Effect.runSync(currentTraceEffect(spans, traces));
 */
export const currentTraceEffect = Effect.fn("ObservabilityExecution.currentTrace")(
  (spans: readonly SpanRecord[], traces: readonly TraceRecord[] = []) =>
    observe(
      "currentTrace",
      Effect.sync(() => core.currentTrace(spans, traces)),
    ),
);
