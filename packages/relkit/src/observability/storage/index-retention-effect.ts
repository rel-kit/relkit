import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import { indexRetentionCore } from "./index-retention-core.js";
import type { IndexConfig, IndexState } from "./index-state.types.js";
/**
 * Tagged retention failure with the original validation or IO cause.
 * @example
 * if (error._tag === "IndexRetentionError") console.error(error.message);
 */
export class IndexRetentionError extends Schema.TaggedError<IndexRetentionError>()(
  "IndexRetentionError",
  { message: Schema.String, cause: Schema.Unknown },
) {}
/**
 * Deletes expired or oversized finalized segments within an observed Effect.
 * The owning index serializes retention with append and finalization.
 * @param root - Segment storage root.
 * @param state - Mutable index state owned by the caller.
 * @param config - Clock and retention limits.
 * @returns An Effect with the removal report or a tagged validation/IO failure.
 * @example
 * const report = await Effect.runPromise(enforceRetentionEffect(root, state, config));
 */
export const enforceRetentionEffect = Effect.fn("ObservabilityIndex.enforceRetention")(
  (root: string, state: IndexState, config: IndexConfig) =>
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis;
      return yield* Effect.onExit(
        Effect.uninterruptible(
          Effect.tryPromise({
            try: () => indexRetentionCore.enforceRetention(root, state, config),
            catch: (cause) =>
              new IndexRetentionError({
                message: cause instanceof Error ? cause.message : String(cause),
                cause,
              }),
          }),
        ),
        (exit) =>
          Effect.gen(function* () {
            yield* Metric.update(
              Metric.counter("relkit_observability_index_retention_total", {
                attributes: { outcome: Exit.isSuccess(exit) ? "success" : "failure" },
              }),
              1,
            );
            yield* Metric.update(
              Metric.timer("relkit_observability_index_retention_duration"),
              Duration.millis((yield* Clock.currentTimeMillis) - started),
            );
          }),
      );
    }),
);
