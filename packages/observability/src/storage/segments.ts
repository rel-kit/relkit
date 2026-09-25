import { Effect } from "effect";
import {
  makeObservabilitySegmentStoreEffect,
  type SegmentOperationError,
} from "./segments-effect.js";
import {
  OBSERVABILITY_SEGMENT_FAILURE,
  DEFAULT_SEGMENT_MAX_BYTES,
  DEFAULT_SEGMENT_MAX_RECORDS,
} from "./segments-core.js";
import type { ObservabilitySegmentOptions, ObservabilitySegmentStore } from "./segments.types.js";
export { OBSERVABILITY_SEGMENT_FAILURE, DEFAULT_SEGMENT_MAX_BYTES, DEFAULT_SEGMENT_MAX_RECORDS };
export type {
  ObservabilitySegmentFailure,
  SegmentFailureControls,
  ObservabilitySegmentOptions,
  ObservabilitySegmentStore,
} from "./segments.types.js";
export {
  SegmentOperationError,
  ObservabilitySegmentStoreService,
  makeObservabilitySegmentStoreEffect,
  observabilitySegmentStoreLayer,
} from "./segments-effect.js";
export type { ObservabilitySegmentStoreEffects } from "./segments-effect.types.js";
function legacyError(error: SegmentOperationError): Error {
  return error.cause instanceof Error ? error.cause : new Error(error.message);
}
/**
 * Opens an indexed, bounded NDJSON segment store.
 * The caller owns close; Effect callers can use the scoped Layer.
 * @param options - Segment sizes, retention, redaction, and index callbacks.
 * @returns A Promise with a live store and its active file handles.
 * @throws {Error} If acquisition, repair, or storage IO fails.
 * @example
 * const store = await createObservabilitySegmentStore({ root });
 * try { await store.flush(); } finally { await store.close(); }
 */
export async function createObservabilitySegmentStore(
  options: ObservabilitySegmentOptions = {},
): Promise<ObservabilitySegmentStore> {
  const store = await Effect.runPromise(
    makeObservabilitySegmentStoreEffect(options).pipe(Effect.mapError(legacyError)),
  );
  const run = <A>(effect: Effect.Effect<A, SegmentOperationError>): Promise<A> =>
    Effect.runPromise(effect.pipe(Effect.mapError(legacyError)));
  const shutdown = () => run(store.shutdown());
  return Object.freeze({
    root: store.root,
    append: (record) => run(store.append(record)),
    flush: () => run(store.flush()),
    shutdown,
    close: shutdown,
  } satisfies ObservabilitySegmentStore);
}
