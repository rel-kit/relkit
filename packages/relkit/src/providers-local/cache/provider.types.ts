import type { Effect } from "effect";
import type { LocalOperationError } from "../local-effect.js";
import type { LocalCacheProvider } from "./types.js";

/** Effect methods and immutable compatibility metadata for one cache owner. */
export type LocalCacheEffects = {
  readonly [
    K in
      "get" | "set" | "delete" | "has" | "getOrSet" | "increment" | "ready" | "close" | "snapshot"
  ]: LocalCacheProvider[K] extends (...args: infer A) => infer R
    ? (...args: A) => Effect.Effect<Awaited<R>, LocalOperationError>
    : never;
} & {
  readonly metadata: Pick<
    LocalCacheProvider,
    "cacheId" | "schemaVersion" | "policy" | "capabilities" | "stateRoot"
  >;
  readonly inspector: LocalCacheProvider["inspector"];
};
