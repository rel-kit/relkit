import { Effect } from "effect";
import { makeObservabilityIndexEffect, type IndexOperationError } from "./index-effect.js";
import type { ObservabilityIndex, ObservabilityIndexOptions } from "./index.types.js";
export * from "./index-types.js";
export {
  IndexOperationError,
  ObservabilityIndexService,
  makeObservabilityIndexEffect,
  observabilityIndexLayer,
} from "./index-effect.js";
export type { ObservabilityIndexEffects } from "./index-effect.types.js";
function legacyError(error: IndexOperationError): Error {
  return error.cause instanceof Error ? error.cause : new Error(error.message);
}
/**
 * Opens a local segment index with serialized writes.
 * The caller owns its close lifecycle; Effect callers can use the scoped Layer.
 * @param options - Root, retention, redaction, clock, and paging settings.
 * @returns A Promise with the live index.
 * @throws {Error} If validation, repair, or filesystem IO fails.
 * @example
 * const index = await createObservabilityIndex({ root });
 * try { index.page(); } finally { await index.close(); }
 */
export async function createObservabilityIndex(
  options: ObservabilityIndexOptions = {},
): Promise<ObservabilityIndex> {
  const index = await Effect.runPromise(
    makeObservabilityIndexEffect(options).pipe(Effect.mapError(legacyError)),
  );
  const runPromise = <A>(effect: Effect.Effect<A, IndexOperationError>): Promise<A> =>
    Effect.runPromise(effect.pipe(Effect.mapError(legacyError)));
  const runSync = <A>(effect: Effect.Effect<A, IndexOperationError>): A =>
    Effect.runSync(effect.pipe(Effect.mapError(legacyError)));
  return Object.freeze({
    root: index.root,
    append: (record, path, offset, bytes) => runPromise(index.append(record, path, offset, bytes)),
    finalize: (activePath, finalPath) => runPromise(index.finalize(activePath, finalPath)),
    rebuild: () => runPromise(index.rebuild()),
    retain: () => runPromise(index.retain()),
    page: (value) => runSync(index.page(value)),
    tracePage: (value) => runSync(index.tracePage(value)),
    read: (entry) => runPromise(index.read(entry)),
    stats: () => runSync(index.stats()),
    flush: () => runPromise(index.flush()),
    close: () => runPromise(index.close()),
  } satisfies ObservabilityIndex);
}
