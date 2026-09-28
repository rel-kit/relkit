import { Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type {
  RealtimeOperation,
  RealtimeTelemetryService,
} from "./realtime-observability.types.js";
/** Injectable realtime telemetry boundary.
 * @example Effect.provide(Effect.succeed(1), RealtimeTelemetryLive);
 */
export class RealtimeTelemetry extends Context.Service<
  RealtimeTelemetry,
  RealtimeTelemetryService
>()("relkit/realtime/RealtimeTelemetry") {}
/** Live span and metric observer for realtime operations.
 * @example Effect.provide(Effect.succeed(1), RealtimeTelemetryLive);
 */
export const RealtimeTelemetryLive = Layer.succeed(RealtimeTelemetry, { observe: observeLive });
const calls = Metric.counter("relkit_realtime_operations_total", { incremental: true });
const failures = Metric.counter("relkit_realtime_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_realtime_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});
/** Observes a realtime operation using the supplied test service or live metrics.
 * @param operation - A stable operation name, never user supplied data.
 * @param effect - The operation to measure.
 * @returns The observed Effect with unchanged success and error channels.
 * @example observeRealtime("channel.define", Effect.succeed(undefined));
 */
export function observeRealtime<A, E, R>(
  operation: RealtimeOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(RealtimeTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}
/** Records call, duration, and failure metrics for every exit. */
function observeLive<A, E, R>(
  operation: RealtimeOperation,
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
    `realtime.${operation}`,
  );
}
