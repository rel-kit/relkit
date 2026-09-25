import { Clock, Context, Duration, Effect, Exit, Layer, Metric, Schema } from "effect";
import { indexCore } from "./index-core.js";
import type { ObservabilityIndexOptions } from "./index.types.js";
import type { ObservabilityIndexEffects } from "./index-effect.types.js";
/**
 * Tagged index operation failure with the original cause for compatibility.
 * @example
 * if (error._tag === "IndexOperationError") console.error(error.operation);
 */
export class IndexOperationError extends Schema.TaggedError<IndexOperationError>()(
  "IndexOperationError",
  { operation: Schema.String, message: Schema.String, cause: Schema.Unknown },
) {}
/**
 * Substitutable live segment index for Effect programs.
 * @example
 * const index = yield* ObservabilityIndexService;
 */
// prettier-ignore
export class ObservabilityIndexService extends Context.Service<ObservabilityIndexService, ObservabilityIndexEffects>()(
  "@relkit/observability/Index",
) {}
function failure(operation: string, cause: unknown): IndexOperationError {
  return new IndexOperationError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
function observe<A>(operation: string, effect: Effect.Effect<A, IndexOperationError>) {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_index_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_index_operation_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
function asyncOperation<A>(operation: string, run: () => Promise<A>) {
  return observe(
    operation,
    Effect.uninterruptible(
      Effect.tryPromise({
        try: run,
        catch: (cause) => failure(operation, cause),
      }),
    ),
  );
}
function syncOperation<A>(operation: string, run: () => A) {
  return observe(
    operation,
    Effect.try({
      try: run,
      catch: (cause) => failure(operation, cause),
    }),
  );
}
/**
 * Acquires an index and exposes its operations through observed Effects.
 * The owner must close the result; use the Layer for scoped release.
 * @param options - Root, retention, redaction, clock, and paging settings.
 * @returns An Effect with the index service or a tagged acquisition error.
 * @example
 * const index = await Effect.runPromise(makeObservabilityIndexEffect({ root }));
 */
export const makeObservabilityIndexEffect = Effect.fn("ObservabilityIndex.create")(
  (options: ObservabilityIndexOptions = {}) =>
    asyncOperation("create", () => indexCore.createObservabilityIndex(options)).pipe(
      Effect.map((index) =>
        ObservabilityIndexService.of({
          root: index.root,
          append: Effect.fn("ObservabilityIndex.append")((record, path, offset, bytes) =>
            asyncOperation("append", () => index.append(record, path, offset, bytes)),
          ),
          finalize: Effect.fn("ObservabilityIndex.finalize")((activePath, finalPath) =>
            asyncOperation("finalize", () => index.finalize(activePath, finalPath)),
          ),
          rebuild: Effect.fn("ObservabilityIndex.rebuild")(() =>
            asyncOperation("rebuild", () => index.rebuild()),
          ),
          retain: Effect.fn("ObservabilityIndex.retain")(() =>
            asyncOperation("retain", () => index.retain()),
          ),
          page: Effect.fn("ObservabilityIndex.page")((value) =>
            syncOperation("page", () => index.page(value)),
          ),
          tracePage: Effect.fn("ObservabilityIndex.tracePage")((value) =>
            syncOperation("tracePage", () => index.tracePage(value)),
          ),
          read: Effect.fn("ObservabilityIndex.read")((entry) =>
            asyncOperation("read", () => index.read(entry)),
          ),
          stats: Effect.fn("ObservabilityIndex.stats")(() =>
            syncOperation("stats", () => index.stats()),
          ),
          flush: Effect.fn("ObservabilityIndex.flush")(() =>
            asyncOperation("flush", () => index.flush()),
          ),
          close: Effect.fn("ObservabilityIndex.close")(() =>
            asyncOperation("close", () => index.close()),
          ),
        }),
      ),
    ),
);
/**
 * Provides a live index and closes it when the surrounding Scope ends.
 * @param options - Index configuration.
 * @returns A scoped Layer with ObservabilityIndexService.
 * @example
 * const program = Effect.gen(function* () { return yield* ObservabilityIndexService; });
 * const layer = observabilityIndexLayer({ root });
 */
export function observabilityIndexLayer(options: ObservabilityIndexOptions = {}) {
  return Layer.effect(
    ObservabilityIndexService,
    Effect.acquireRelease(makeObservabilityIndexEffect(options), (index) =>
      index.close().pipe(Effect.orDie),
    ),
  );
}
