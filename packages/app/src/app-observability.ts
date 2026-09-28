import { Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type { AppOperation, AppTelemetryService } from "./app-observability.types.js";

/** Injectable observer for application authoring operations.
 * @example Effect.provide(defineAppEffect(options), AppTelemetryLive);
 */
export class AppTelemetry extends Context.Service<AppTelemetry, AppTelemetryService>()(
  "relkit/app/AppTelemetry",
) {}

/** Live spans, counts, failures, and durations for application operations.
 * @example Effect.provide(defineAppEffect(options), AppTelemetryLive);
 */
export const AppTelemetryLive = Layer.succeed(AppTelemetry, { observe: observeLive });

const calls = Metric.counter("relkit_app_operations_total", { incremental: true });
const failures = Metric.counter("relkit_app_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_app_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Applies an injected observer or the live observer to one operation.
 * @param operation - Fixed operation label.
 * @param effect - Operation to measure.
 * @returns The observed Effect, retaining success, error, and requirements.
 * @example observeApp("define", Effect.succeed(app));
 */
export function observeApp<A, E, R>(
  operation: AppOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(AppTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

/** Records one duration on every exit, including interruption and defects. */
function observeLive<A, E, R>(
  operation: AppOperation,
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
    `app.${operation}`,
  );
}
