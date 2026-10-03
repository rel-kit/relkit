import type { CacheOperationContext } from "@relkit/cache";
import type { Deferred, Effect, Ref } from "effect";
import type { LocalOperationError } from "../local-effect.js";
import type { LocalCacheStore, MISSING } from "./store.js";
import type { LocalCachePolicy } from "./types.js";

/** Shared cache state and effectful dependencies acquired once by its owner. */
export interface CacheOperationState {
  readonly cacheId: string;
  readonly schemaVersion: string | number;
  readonly policy: Readonly<LocalCachePolicy>;
  readonly store: LocalCacheStore;
  readonly flights: Ref.Ref<Map<string, Deferred.Deferred<unknown, LocalOperationError>>>;
  readonly time: () => Effect.Effect<number, LocalOperationError>;
  readonly ensureOpen: () => Effect.Effect<void, LocalOperationError>;
  readonly changed: () => Effect.Effect<unknown>;
  readonly persist: () => Effect.Effect<void, LocalOperationError>;
}

/** TTL-aware internal lookup that distinguishes missing entries from stored values. */
export type CacheRead = (
  key: unknown,
  context?: CacheOperationContext,
) => Effect.Effect<unknown | typeof MISSING, LocalOperationError>;
