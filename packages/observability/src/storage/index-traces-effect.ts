import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import { indexTracesCore } from "./index-traces-core.js";
import type { IndexConfig, IndexState } from "./index-state.types.js";
import type { ObservabilityIndexPageOptions } from "./index.types.js";
/**
 * Tagged trace page validation failure with its original cause.
 * @example
 * if (error._tag === "IndexTracePageError") console.error(error.message);
 */
export class IndexTracePageError extends Schema.TaggedError<IndexTracePageError>()(
  "IndexTracePageError",
  { message: Schema.String, cause: Schema.Unknown },
) {}
/**
 * Reads one deduplicated trace page in an observed Effect.
 * The owning index serializes mutations to the supplied state.
 * @param state - Current index state.
 * @param config - Page size and index settings.
 * @param options - Cursor, order, and filters.
 * @returns An Effect with one page or a tagged invalid option failure.
 * @example
 * const page = Effect.runSync(readTracePageEffect(state, config, {}));
 */
export const readTracePageEffect = Effect.fn("ObservabilityIndex.readTracePage")(
  (state: IndexState, config: IndexConfig, options: ObservabilityIndexPageOptions) =>
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis;
      return yield* Effect.onExit(
        Effect.try({
          try: () => indexTracesCore.readTracePage(state, config, options),
          catch: (cause) =>
            new IndexTracePageError({
              message: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        }),
        (exit) =>
          Effect.gen(function* () {
            yield* Metric.update(
              Metric.counter("relkit_observability_index_trace_pages_total", {
                attributes: { outcome: Exit.isSuccess(exit) ? "success" : "failure" },
              }),
              1,
            );
            yield* Metric.update(
              Metric.timer("relkit_observability_index_trace_page_duration"),
              Duration.millis((yield* Clock.currentTimeMillis) - started),
            );
          }),
      );
    }),
);
