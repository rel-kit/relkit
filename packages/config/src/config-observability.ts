import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type { ConfigOperation, ConfigTelemetryService } from "./config-observability.types.js";

export type { ConfigOperation, ConfigTelemetryService } from "./config-observability.types.js";

/** Injectable telemetry for environment operations.
 * @example Effect.provide(resolveEnvEffect(definition, options), ConfigTelemetryLive);
 */
export class ConfigTelemetry extends Context.Service<ConfigTelemetry, ConfigTelemetryService>()(
  "relkit/config/ConfigTelemetry",
) {}

/** Live spans and bounded operation metrics.
 * @example Effect.runSync(Effect.provide(projectEnvEffect(definition), ConfigTelemetryLive));
 */
export const ConfigTelemetryLive = Layer.succeed(ConfigTelemetry, { observe: observeLive });

const calls = Metric.counter("relkit_config_operations_total", { incremental: true });
const failures = Metric.counter("relkit_config_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_config_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Observe an Effect operation with a stable span and operation metrics.
 * @param operation - Bounded operation name.
 * @param effect - Operation to observe.
 * @returns The original Effect success and error channels.
 * @example observeConfig("project", Effect.succeed([]));
 */
export function observeConfig<A, E, R>(
  operation: ConfigOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(ConfigTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

function observeLive<A, E, R>(
  operation: ConfigOperation,
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
    `config.${operation}`,
  );
}

/** Run a synchronous compatibility adapter while retaining its original failure.
 * @param effect - Fully provided Effect operation.
 * @returns The successful value.
 * @throws The domain error, original defect, or mapped compatibility TypeError.
 * @example runConfigSync(Effect.succeed("ready"));
 */
export function runConfigSync<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.squash(exit.cause);
  if (error instanceof ConfigValidationError) {
    if (error.syntax) throw new SyntaxError(error.message);
    throw new TypeError(error.message);
  }
  throw error;
}

import { ConfigValidationError } from "./config-validation-error.js";
