import { Clock, Context, Duration, Effect, Exit, Layer, Metric, Schema } from "effect";
import { segmentsCore } from "./segments-core.js";
import type { ObservabilitySegmentOptions } from "./segments.types.js";
import type { ObservabilitySegmentStoreEffects } from "./segments-effect.types.js";
/**
 * Tagged segment operation failure with its original cause for compatibility.
 * @example
 * if (error._tag === "SegmentOperationError") console.error(error.operation);
 */
export class SegmentOperationError extends Schema.TaggedError<SegmentOperationError>()(
  "SegmentOperationError",
  { operation: Schema.String, message: Schema.String, cause: Schema.Unknown },
) {}
/**
 * Substitutable segment store with scoped handle ownership.
 * @example
 * const store = yield* ObservabilitySegmentStoreService;
 */
// prettier-ignore
export class ObservabilitySegmentStoreService extends Context.Service<ObservabilitySegmentStoreService, ObservabilitySegmentStoreEffects>()(
  "@relkit/observability/SegmentStore",
) {}
function failure(operation: string, cause: unknown): SegmentOperationError {
  return new SegmentOperationError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
function observe<A>(operation: string, effect: Effect.Effect<A, SegmentOperationError>) {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_segment_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_segment_operation_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
function operation<A>(name: string, run: () => Promise<A>) {
  return observe(
    name,
    Effect.uninterruptible(
      Effect.tryPromise({
        try: run,
        catch: (cause) => failure(name, cause),
      }),
    ),
  );
}
/**
 * Opens an indexed segment store with observed Effect operations.
 * The owner must close the result; use the Layer for scoped release.
 * @param options - Segment sizes, redaction, index, and failure callbacks.
 * @returns An Effect with the live store or a tagged acquisition error.
 * @example
 * const store = await Effect.runPromise(makeObservabilitySegmentStoreEffect({ root }));
 */
export const makeObservabilitySegmentStoreEffect = Effect.fn("ObservabilitySegments.create")(
  (options: ObservabilitySegmentOptions = {}) =>
    operation("create", () => segmentsCore.createObservabilitySegmentStore(options)).pipe(
      Effect.map((store) =>
        ObservabilitySegmentStoreService.of({
          root: store.root,
          append: Effect.fn("ObservabilitySegments.append")((record) =>
            operation("append", () => store.append(record)),
          ),
          flush: Effect.fn("ObservabilitySegments.flush")(() =>
            operation("flush", () => store.flush()),
          ),
          shutdown: Effect.fn("ObservabilitySegments.shutdown")(() =>
            operation("shutdown", () => store.shutdown()),
          ),
          close: Effect.fn("ObservabilitySegments.close")(() =>
            operation("close", () => store.close()),
          ),
        }),
      ),
    ),
);
/**
 * Provides a live store and closes active handles at Scope exit.
 * @param options - Segment store configuration.
 * @returns A scoped Layer with ObservabilitySegmentStoreService.
 * @example
 * const program = Effect.gen(function* () { return yield* ObservabilitySegmentStoreService; });
 * const layer = observabilitySegmentStoreLayer({ root });
 */
export function observabilitySegmentStoreLayer(options: ObservabilitySegmentOptions = {}) {
  return Layer.effect(
    ObservabilitySegmentStoreService,
    Effect.acquireRelease(makeObservabilitySegmentStoreEffect(options), (store) =>
      store.close().pipe(Effect.orDie),
    ),
  );
}
