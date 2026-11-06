/** Inputs of the shared cache provider conformance suite. */
import type { CacheProvider } from "relkit/cache";
import type { ConformanceCase } from "./conformance.types.js";

/** A cache provider under test, with the optional lifecycle methods first-party providers have. */
export type CacheConformanceProvider = CacheProvider & {
  readonly ready?: () => Promise<unknown>;
  readonly close?: () => Promise<unknown>;
};

/** What a cache provider supplies to run the suite. */
export interface CacheConformanceOptions {
  /**
   * Creates a provider for one case. Each case passes a fresh cache id, so cases never share keys.
   * @param cacheId - Unique cache id for the case.
   */
  readonly create: (cacheId: string) => CacheConformanceProvider;
  /**
   * Failure injection: creates a provider whose backend cannot answer (an unreachable server, a
   * missing binding, a fault switch). The `backend-failure` case is skipped without it.
   */
  readonly failing?: () => CacheConformanceProvider;
  /** Smallest TTL the backend accepts, such as 60 000 ms on Cloudflare KV; 0 by default. */
  readonly minTtlMs?: number;
}

/** Case ids of the cache suite. */
export type CacheConformanceCaseId =
  | "round-trip"
  | "has-delete"
  | "get-or-set"
  | "increment"
  | "ttl"
  | "cancellation"
  | "closed"
  | "backend-failure";

/** One cache conformance case. */
export type CacheConformanceCase = ConformanceCase<CacheConformanceCaseId>;
