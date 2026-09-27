import { Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type { JobsOperation, JobsTelemetryService } from "./jobs-observability.types.js";

/** Injectable observer for jobs Effect operations.
 * @example Effect.provide(durationToMillisEffect("1 second"), JobsTelemetryLive);
 */
export class JobsTelemetry extends Context.Service<JobsTelemetry, JobsTelemetryService>()(
  "relkit/jobs/JobsTelemetry",
) {}

/** Live spans and bounded jobs operation metrics.
 * @example Effect.provide(durationToMillisEffect("1 second"), JobsTelemetryLive);
 */
export const JobsTelemetryLive = Layer.succeed(JobsTelemetry, { observe: observeLive });

const calls = Metric.counter("relkit_jobs_operations_total", { incremental: true });
const failures = Metric.counter("relkit_jobs_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_jobs_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Observes an operation with a supplied service or the live observer.
 * @param operation - Fixed name used as the only metric attribute.
 * @param effect - Operation to measure.
 * @returns The input Effect with its success and error channels preserved.
 * @example observeJobs("duration.toMillis", Effect.succeed(1000));
 */
export function observeJobs<A, E, R>(
  operation: JobsOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(JobsTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

/** Records duration on every exit, including interruption and defects. */
function observeLive<A, E, R>(
  operation: JobsOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const attributes = { operation };
  return Effect.withSpan(
    Effect.gen(function* () {
      const started = yield* Clock.monotonicTimeNanos;
      yield* Metric.update(Metric.withAttributes(calls, attributes), 1);
      return yield* Effect.onExit(effect, (exit) =>
        Effect.gen(function* () {
          const elapsed = Number((yield* Clock.monotonicTimeNanos) - started) / 1_000_000;
          yield* Metric.update(Metric.withAttributes(duration, attributes), Math.max(0, elapsed));
          if (Exit.isFailure(exit))
            yield* Metric.update(Metric.withAttributes(failures, attributes), 1);
        }),
      );
    }),
    `jobs.${operation}`,
  );
}
