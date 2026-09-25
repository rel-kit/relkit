import { Effect } from "effect";
import { readTracePageEffect } from "./index-traces-effect.js";
import type { IndexConfig, IndexState } from "./index-state.types.js";
import type { ObservabilityIndexPage, ObservabilityIndexPageOptions } from "./index.types.js";
export { IndexTracePageError, readTracePageEffect } from "./index-traces-effect.js";
/**
 * Reads one deduplicated trace page from index state.
 * The caller owns synchronization with index mutation.
 * @param state - Current index state.
 * @param config - Page size and index settings.
 * @param options - Cursor, order, and filters.
 * @returns One immutable trace page.
 * @throws {Error} If a cursor or page bound is invalid.
 * @example
 * const page = readTracePage(state, config, { limit: 10 });
 */
export function readTracePage(
  state: IndexState,
  config: IndexConfig,
  options: ObservabilityIndexPageOptions,
): ObservabilityIndexPage {
  return Effect.runSync(
    readTracePageEffect(state, config, options).pipe(
      Effect.mapError((error) =>
        error.cause instanceof Error ? error.cause : new Error(error.message),
      ),
    ),
  );
}
