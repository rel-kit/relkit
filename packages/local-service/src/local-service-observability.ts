import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import {
  LocalServiceValidationFailure,
  LocalServiceVersionError,
  LocalServiceVersionFailure,
} from "./local-service-errors.js";
import type {
  LocalServiceOperation,
  LocalServiceTelemetryService,
} from "./local-service-observability.types.js";

/** Substitutable telemetry service for local-service operations.
 * @example Effect.provide(normalizeLocalServiceRecipeEffect(recipe), LocalServiceTelemetryLive);
 */
export class LocalServiceTelemetry extends Context.Service<
  LocalServiceTelemetry,
  LocalServiceTelemetryService
>()("relkit/local-service/LocalServiceTelemetry") {}

/** Live operation spans and metrics.
 * @example Effect.runSync(Effect.provide(normalizeLocalServiceRecipeEffect(recipe), LocalServiceTelemetryLive));
 */
export const LocalServiceTelemetryLive = Layer.succeed(LocalServiceTelemetry, {
  observe: observeLive,
});

const calls = Metric.counter("relkit_local_service_operations_total", { incremental: true });
const failures = Metric.counter("relkit_local_service_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_local_service_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Observe one public operation using an injected or live telemetry service.
 * @param operation - Bounded operation label.
 * @param effect - Operation to observe.
 * @returns The original Effect success and error channels.
 * @example observeLocalService("recipe.normalize", Effect.succeed(recipe));
 */
export function observeLocalService<A, E, R>(
  operation: LocalServiceOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(LocalServiceTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

function observeLive<A, E, R>(
  operation: LocalServiceOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const attributes = { operation };
  return Effect.withSpan(
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis;
      yield* Metric.update(Metric.withAttributes(calls, attributes), 1);
      return yield* Effect.onExit(effect, (exit) =>
        Effect.gen(function* () {
          const elapsed = (yield* Clock.currentTimeMillis) - started;
          yield* Metric.update(Metric.withAttributes(duration, attributes), Math.max(0, elapsed));
          if (Exit.isFailure(exit))
            yield* Metric.update(Metric.withAttributes(failures, attributes), 1);
        }),
      );
    }),
    `local-service.${operation}`,
  );
}

/** Run a synchronous compatibility adapter and restore legacy errors.
 * @param effect - Fully provided operation Effect.
 * @returns The operation result.
 * @throws TypeError or LocalServiceVersionError for expected failures; defects propagate.
 * @example runLocalService(Effect.succeed("ready"));
 */
export function runLocalService<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const cause = Cause.squash(exit.cause);
  if (cause instanceof LocalServiceValidationFailure) throw new TypeError(cause.message);
  if (cause instanceof LocalServiceVersionFailure)
    throw new LocalServiceVersionError(
      cause.code,
      cause.label,
      cause.version,
      cause.expected,
      cause.command,
    );
  throw cause;
}
