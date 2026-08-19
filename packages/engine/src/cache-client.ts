import { createCacheClient } from "@zsys/cache";
import type { DependencyClientBuildOptions } from "./dependencies.js";

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
