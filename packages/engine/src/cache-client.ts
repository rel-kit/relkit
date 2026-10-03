import { createCacheClient } from "@relkit/cache";
import type { DependencyClientBuildOptions } from "./dependencies.js";

/** Build a declared cache client that observes reads/writes through the invocation bridge.
 * @returns A guarded cache client whose methods retain the active invocation bridge.
 * @param name - Declared operation, dependency or field name.
 * @param cacheId - Canonical cache identifier bound to its schema and storage source.
 * @param source - Explicit native source or source collection.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function createCacheDependencyClient(
  name: string,
  cacheId: string,
  source: unknown,
  options: DependencyClientBuildOptions,
): unknown {
  const declaration = options.dependencies?.cache?.[name];
  return createCacheClient({
    ownerId: options.ownerId,
    cacheId,
    source,
    ...(declaration?.key === undefined ? {} : { keySchema: declaration.key }),
    ...(declaration?.value === undefined ? {} : { valueSchema: declaration.value }),
    ...(declaration?.defaultTtlMs === undefined ? {} : { defaultTtlMs: declaration.defaultTtlMs }),
    ...(declaration?.maxTtlMs === undefined ? {} : { maxTtlMs: declaration.maxTtlMs }),
    ...(options.bridge === undefined ? {} : { bridge: options.bridge }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    ...(options.onObservedEdge === undefined ? {} : { onObservedEdge: options.onObservedEdge }),
    ...(options.onOperation === undefined ? {} : { onOperation: options.onOperation }),
  });
}
