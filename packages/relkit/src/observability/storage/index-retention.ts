import { Effect } from "effect";
import type { ObservabilityRetentionReport } from "./index-types.js";
import { enforceRetentionEffect } from "./index-retention-effect.js";
import type { IndexConfig, IndexState } from "./index-state.types.js";
export { IndexRetentionError, enforceRetentionEffect } from "./index-retention-effect.js";
/**
 * Deletes expired or oversized finalized segments from a live index.
 * The owning index serializes this operation with append and finalization.
 * @param root - Segment storage root.
 * @param state - Mutable index state owned by the caller.
 * @param config - Clock and retention limits.
 * @returns A Promise with removed segment, record, and byte counts.
 * @throws {Error} If the clock is invalid or filesystem deletion fails.
 * @example
 * const report = await enforceRetention(root, state, config);
 */
export function enforceRetention(
  root: string,
  state: IndexState,
  config: IndexConfig,
): Promise<ObservabilityRetentionReport> {
  return Effect.runPromise(
    enforceRetentionEffect(root, state, config).pipe(
      Effect.mapError((error) =>
        error.cause instanceof Error ? error.cause : new Error(error.message),
      ),
    ),
  );
}
