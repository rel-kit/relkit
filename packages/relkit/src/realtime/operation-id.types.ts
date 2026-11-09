import type { Effect } from "effect";

/** Optional receipt-window clock controls for ID parsing.
 * @example const options: ParseOperationIdOptions = { now: Date.now(), receiptWindowMs: 60000 };
 */
export interface ParseOperationIdOptions {
  readonly now?: number;
  readonly receiptWindowMs?: number;
}

/** Injectable source of UUIDv7 random bytes.
 * @example const source: OperationIdEntropyService = { bytes: () => Effect.succeed(new Uint8Array(16)) };
 */
export interface OperationIdEntropyService {
  /** Produces sixteen independent bytes.
   * @returns An Effect of random bytes without a typed failure.
   * @example Effect.runSync(source.bytes());
   */
  readonly bytes: () => Effect.Effect<Uint8Array>;
}
