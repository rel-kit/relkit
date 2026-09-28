import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import { ServiceValidationError } from "./service-error.js";
import type { ServiceOperation, ServiceTelemetryService } from "./service-observability.types.js";

/** Substitutable telemetry for all service operations.
 * @example Effect.provide(isServiceRefEffect(value), ServiceTelemetryLive);
 */
export class ServiceTelemetry extends Context.Service<ServiceTelemetry, ServiceTelemetryService>()(
  "relkit/services/ServiceTelemetry",
) {}

/** Live span, call, duration, and failure instrumentation.
 * @example Effect.provide(isServiceRefEffect(value), ServiceTelemetryLive);
 */
export const ServiceTelemetryLive = Layer.succeed(ServiceTelemetry, { observe: observeLive });

const calls = Metric.counter("relkit_service_operations_total", { incremental: true });
const failures = Metric.counter("relkit_service_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_service_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Observe one service operation using an injected or live observer.
 * @param operation - Fixed operation label.
 * @param effect - Work to observe.
 * @returns Its original Effect channels, with telemetry on execution.
 * @example observeService("ref.is", Effect.succeed(true));
 */
export function observeService<A, E, R>(
  operation: ServiceOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(ServiceTelemetry), (provided) =>
    Option.isSome(provided)
      ? provided.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

function observeLive<A, E, R>(
  operation: ServiceOperation,
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
    `services.${operation}`,
  );
}

/** Run a dependency-free Effect for a synchronous compatibility caller.
 * @param effect - Fully provided service operation.
 * @returns Its success value.
 * @throws TypeError for local validation, an original dependency error, or a defect.
 * @example runServiceSync(Effect.succeed(1));
 */
export function runServiceSync<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const cause = Cause.squash(exit.cause);
  if (cause instanceof ServiceValidationError) {
    if (cause.cause instanceof Error) throw cause.cause;
    throw new TypeError(cause.message);
  }
  throw cause;
}
