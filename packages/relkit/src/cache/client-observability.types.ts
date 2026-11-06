import type { Effect } from "effect";
import type { CacheOperation } from "./client.types.js";
import type { CacheOperationOutcome } from "./client-operation.types.js";
/** Names of observed public cache operations.
 * @example const operation: CacheObservedOperation = "get";
 */
export type CacheObservedOperation =
  CacheOperation | "define" | "isDescriptor" | "assertDescriptor" | "createClient";
/** A declared dependency edge observed without any cache key or value.
 * @example const edge: CacheObservedEdge = { relationship: "uses-cache", from: "orders", to: "prices" };
 */
export interface CacheObservedEdge {
  readonly relationship: "uses-cache";
  readonly from: string;
  readonly to: string;
}
/** One operation outcome with bounded, input-free fields.
 * @example const event: CacheOperationObservation = { capability: "cache", operation: "get", ownerId: "orders", cacheId: "prices", outcome: "success" };
 */
export interface CacheOperationObservation {
  readonly capability: "cache";
  readonly operation: CacheOperation;
  readonly ownerId: string;
  readonly cacheId: string;
  readonly outcome: CacheOperationOutcome;
}
/** Replaceable telemetry boundary for cache Effect calls.
 * @example const telemetry: CacheTelemetryService = { observe: (_name, effect) => effect };
 */
export interface CacheTelemetryService {
  /** Wraps an operation with tracing and metrics.
   * @param operation - Stable operation name.
   * @param effect - Work to observe.
   * @returns The same Effect success and error channels.
   * @example telemetry.observe("get", Effect.succeed(undefined));
   */
  readonly observe: <A, E, R>(
    operation: CacheObservedOperation,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}
