/** Cryptographic byte source used when creating W3C trace identifiers. */
export interface TraceRandomService {
  /**
   * Fills a byte array with secure randomness.
   * @param bytes - Mutable output array to fill completely.
   * @returns An Effect that fills the array, or TraceRandomError.
   * @example Effect.runSync(random.fill(new Uint8Array(16)));
   */
  readonly fill: (bytes: Uint8Array) => Effect.Effect<void, TraceRandomError>;
}
import type { Effect } from "effect";
import type { TraceRandomError } from "./trace-random.js";
