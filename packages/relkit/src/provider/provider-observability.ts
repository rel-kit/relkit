import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import {
  ProviderBindingResolutionError,
  ProviderFeatureMismatchError,
  ProviderInputError,
  ProviderProfileSelectionError,
} from "./provider-compat-errors.js";
import {
  ProviderBindingResolutionFailure,
  ProviderFeatureMismatchFailure,
  ProviderProfileSelectionFailure,
  ProviderValidationError,
} from "./provider-errors.js";
import type {
  ProviderError,
  ProviderOperation,
  ProviderTelemetryService,
} from "./provider-observability.types.js";
export type {
  ProviderError,
  ProviderOperation,
  ProviderTelemetryService,
} from "./provider-observability.types.js";
/** Injectable telemetry for provider operations.
 * @example Effect.provide(defineProviderCapabilityEffect("cache"), ProviderTelemetryLive);
 */
export class ProviderTelemetry extends Context.Service<
  ProviderTelemetry,
  ProviderTelemetryService
>()("relkit/provider/ProviderTelemetry") {}
/** Live spans and metrics for provider operations.
 * @example Effect.runSync(Effect.provide(defineProviderCapabilityEffect("cache"), ProviderTelemetryLive));
 */
export const ProviderTelemetryLive = Layer.succeed(ProviderTelemetry, { observe: observeLive });
const calls = Metric.counter("relkit_provider_operations_total", { incremental: true });
const failures = Metric.counter("relkit_provider_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_provider_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});
/** Records a fixed provider operation with substitutable telemetry.
 * @param operation - Fixed name; never includes user input.
 * @param effect - Operation to measure.
 * @returns The original success and error channels with telemetry.
 * @example observeProvider("capability.define", Effect.succeed("cache"));
 */
export function observeProvider<A, E, R>(
  operation: ProviderOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(ProviderTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}
function observeLive<A, E, R>(
  operation: ProviderOperation,
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
    `provider.${operation}`,
  );
}
/** Runs synchronous provider logic inside Effect and tags known validation failures.
 * @param code - Stable error category for a validation failure.
 * @param evaluate - Pure provider calculation.
 * @returns The value, a tagged validation error, or a defect for unexpected exceptions.
 * @example providerCalculation("INVALID_ID", () => "cache");
 */
export function providerCalculation<A>(
  code: ProviderValidationError["code"],
  evaluate: () => A,
): Effect.Effect<A, ProviderError> {
  return Effect.suspend(() => {
    try {
      return Effect.succeed(evaluate());
    } catch (cause) {
      if (
        cause instanceof ProviderValidationError ||
        cause instanceof ProviderProfileSelectionFailure ||
        cause instanceof ProviderFeatureMismatchFailure ||
        cause instanceof ProviderBindingResolutionFailure
      )
        return Effect.fail(cause);
      if (cause instanceof ProviderProfileSelectionError)
        return Effect.fail(
          new ProviderProfileSelectionFailure({
            code: cause.code,
            capability: cause.capability,
            descriptorId: cause.descriptorId,
            profiles: cause.profiles,
            reason: cause.reason,
            message: cause.message,
          }),
        );
      if (cause instanceof ProviderFeatureMismatchError)
        return Effect.fail(
          new ProviderFeatureMismatchFailure({
            code: cause.code,
            capability: cause.capability,
            profile: cause.profile,
            descriptorId: cause.descriptorId,
            features: cause.features,
            message: cause.message,
          }),
        );
      if (cause instanceof ProviderBindingResolutionError)
        return Effect.fail(
          new ProviderBindingResolutionFailure({
            code: cause.code,
            bindingId: cause.bindingId,
            field: cause.field,
            reason: cause.reason,
            message: cause.message,
          }),
        );
      if (cause instanceof ProviderInputError)
        return Effect.fail(new ProviderValidationError({ code, message: cause.message }));
      return Effect.die(cause);
    }
  });
}
/** Runs a public synchronous compatibility adapter.
 * @param effect - Fully provided provider Effect.
 * @returns Its successful value.
 * @throws A TypeError for general validation, a named domain error, or an unexpected defect.
 * @example runProvider(Effect.succeed("cache"));
 */
export function runProvider<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const cause = Cause.squash(exit.cause);
  if (cause instanceof ProviderValidationError) throw new TypeError(cause.message);
  if (cause instanceof ProviderProfileSelectionFailure)
    throw new ProviderProfileSelectionError(
      cause.code,
      cause.capability,
      cause.descriptorId,
      cause.profiles,
      cause.reason,
    );
  if (cause instanceof ProviderFeatureMismatchFailure)
    throw new ProviderFeatureMismatchError(
      cause.capability,
      cause.profile,
      cause.descriptorId,
      cause.features,
    );
  if (cause instanceof ProviderBindingResolutionFailure)
    throw new ProviderBindingResolutionError(
      cause.code,
      cause.bindingId,
      cause.field,
      cause.reason,
    );
  throw cause;
}
