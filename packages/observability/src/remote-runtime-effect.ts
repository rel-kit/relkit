import { Clock, Context, Duration, Effect, Exit, Layer, Metric, Schema } from "effect";
import { remoteRuntimeCore } from "./remote-runtime-core.js";
import type { ObservabilityRuntimeOptions } from "./runtime.types.js";
import type { RemoteObservabilityOptions } from "./remote-runtime.types.js";
import type { RemoteObservabilityRuntimeEffects } from "./remote-runtime-effect.types.js";
/**
 * Tagged remote runtime acquisition or release failure with its original cause.
 * @example
 * if (error._tag === "RemoteRuntimeError") console.error(error.operation);
 */
export class RemoteRuntimeError extends Schema.TaggedError<RemoteRuntimeError>()(
  "RemoteRuntimeError",
  { operation: Schema.String, message: Schema.String, cause: Schema.Unknown },
) {}
/**
 * Substitutable remote runtime with scoped queue, timer, and stream ownership.
 * @example
 * const runtime = yield* RemoteObservabilityRuntimeService;
 */
// prettier-ignore
export class RemoteObservabilityRuntimeService extends Context.Service<RemoteObservabilityRuntimeService, RemoteObservabilityRuntimeEffects>()(
  "@relkit/observability/RemoteRuntime",
) {}
function operation<A>(name: string, run: () => Promise<A>) {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(
      Effect.uninterruptible(
        Effect.tryPromise({
          try: run,
          catch: (cause) =>
            new RemoteRuntimeError({
              operation: name,
              message: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        }),
      ),
      (exit) =>
        Effect.gen(function* () {
          yield* Metric.update(
            Metric.counter("relkit_observability_remote_runtime_operations_total", {
              attributes: {
                operation: name,
                outcome: Exit.isSuccess(exit) ? "success" : "failure",
              },
            }),
            1,
          );
          yield* Metric.update(
            Metric.timer("relkit_observability_remote_runtime_operation_duration", {
              attributes: { operation: name },
            }),
            Duration.millis((yield* Clock.currentTimeMillis) - started),
          );
        }),
    );
  });
}
/**
 * Acquires a remote runtime as an observed Effect.
 * The owner must close it; use the Layer for scoped release.
 * @param options - Capture, retention, and exporter settings.
 * @param remote - Endpoint and credentials.
 * @returns An Effect with the runtime or a tagged acquisition error.
 * @example
 * const runtime = await Effect.runPromise(makeRemoteObservabilityRuntimeEffect(options, remote));
 */
export const makeRemoteObservabilityRuntimeEffect = Effect.fn("ObservabilityRemoteRuntime.create")(
  (options: ObservabilityRuntimeOptions, remote: RemoteObservabilityOptions) =>
    operation("create", () => remoteRuntimeCore.createRemoteObservabilityRuntime(options, remote)),
);
/**
 * Provides a remote runtime and releases its queue, stream, timer, and exporter.
 * @param options - Capture and exporter settings.
 * @param remote - Endpoint and credentials.
 * @returns A scoped Layer with RemoteObservabilityRuntimeService.
 * @example
 * const program = Effect.gen(function* () { return yield* RemoteObservabilityRuntimeService; });
 * const layer = remoteObservabilityRuntimeLayer(options, remote);
 */
export function remoteObservabilityRuntimeLayer(
  options: ObservabilityRuntimeOptions,
  remote: RemoteObservabilityOptions,
) {
  return Layer.effect(
    RemoteObservabilityRuntimeService,
    Effect.acquireRelease(makeRemoteObservabilityRuntimeEffect(options, remote), (runtime) =>
      operation("close", () => runtime.close()).pipe(Effect.orDie),
    ),
  );
}
