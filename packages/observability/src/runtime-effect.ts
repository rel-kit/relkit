import { Clock, Context, Duration, Effect, Exit, Layer, Metric, Schema } from "effect";
import { runtimeCore } from "./runtime-core.js";
import type { ObservabilityRuntimeOptions } from "./runtime.types.js";
import type { ObservabilityRuntimeEffects } from "./runtime-effect.types.js";
/**
 * Tagged runtime acquisition or release failure with the original cause.
 * @example
 * if (error._tag === "RuntimeOperationError") console.error(error.operation);
 */
export class RuntimeOperationError extends Schema.TaggedError<RuntimeOperationError>()(
  "RuntimeOperationError",
  { operation: Schema.String, message: Schema.String, cause: Schema.Unknown },
) {}
/**
 * Substitutable local or remote runtime with a scoped owner.
 * @example
 * const runtime = yield* ObservabilityRuntimeService;
 */
// prettier-ignore
export class ObservabilityRuntimeService extends Context.Service<ObservabilityRuntimeService, ObservabilityRuntimeEffects>()(
  "@relkit/observability/Runtime",
) {}
function operation<A>(name: string, run: () => Promise<A>) {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(
      Effect.uninterruptible(
        Effect.tryPromise({
          try: run,
          catch: (cause) =>
            new RuntimeOperationError({
              operation: name,
              message: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        }),
      ),
      (exit) =>
        Effect.gen(function* () {
          yield* Metric.update(
            Metric.counter("relkit_observability_runtime_operations_total", {
              attributes: {
                operation: name,
                outcome: Exit.isSuccess(exit) ? "success" : "failure",
              },
            }),
            1,
          );
          yield* Metric.update(
            Metric.timer("relkit_observability_runtime_operation_duration", {
              attributes: { operation: name },
            }),
            Duration.millis((yield* Clock.currentTimeMillis) - started),
          );
        }),
    );
  });
}
/**
 * Acquires a local or remote runtime as an observed Effect.
 * The caller must close it; use the Layer for scoped release.
 * @param options - Runtime storage, capture, export, and remote settings.
 * @returns An Effect with the live runtime or a tagged acquisition error.
 * @example
 * const runtime = await Effect.runPromise(makeObservabilityRuntimeEffect({ root }));
 */
export const makeObservabilityRuntimeEffect = Effect.fn("ObservabilityRuntime.create")(
  (options: ObservabilityRuntimeOptions = {}) =>
    operation("create", () => runtimeCore.createObservabilityRuntime(options)),
);
/**
 * Provides a runtime and releases all owned resources at Scope exit.
 * @param options - Local or remote runtime settings.
 * @returns A scoped Layer with ObservabilityRuntimeService.
 * @example
 * const program = Effect.gen(function* () { return yield* ObservabilityRuntimeService; });
 * const layer = observabilityRuntimeLayer({ root });
 */
export function observabilityRuntimeLayer(options: ObservabilityRuntimeOptions = {}) {
  return Layer.effect(
    ObservabilityRuntimeService,
    Effect.acquireRelease(makeObservabilityRuntimeEffect(options), (runtime) =>
      operation("close", () => runtime.close()).pipe(Effect.orDie),
    ),
  );
}
