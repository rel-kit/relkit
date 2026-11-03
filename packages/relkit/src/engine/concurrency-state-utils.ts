import { validateLimit } from "./concurrency-limits.js";
import type { ConcurrencyAdmissionRequest, FunctionState } from "./concurrency.types.js";

/** Validate function/trigger limits before enqueuing admission.
 * @returns Nothing; invalid request metadata throws before queue insertion.
 * @param request - Declared operation identity, limits and cancellation metadata.
 */
export function validateRequest(request: ConcurrencyAdmissionRequest): void {
  if (request.functionId.length === 0) throw new TypeError("functionId must not be empty");
  validateLimit(request.limit, "limit");
  validateLimit(request.functionLimit, "functionLimit");
  validateLimit(request.triggerLimit, "triggerLimit");
  if (request.triggerId !== undefined && request.triggerId.length === 0) {
    throw new TypeError("triggerId must not be empty");
  }
}

/** Select the explicit trigger identity or invocation-source fallback.
 * @returns The explicit trigger identity or invocation-source key.
 * @param request - Declared operation identity, limits and cancellation metadata.
 */
export function triggerKey(request: ConcurrencyAdmissionRequest): string {
  return request.triggerId ?? request.source;
}

/** Release one trigger slot and remove empty capacity entries.
 * @returns Nothing; updates only generation-owned trigger capacity.
 * @param values - Mutable internal lookup state owned by this generation.
 * @param key - Stable lookup or idempotency key.
 */
export function decrement(values: Map<string, number>, key: string): void {
  const count = values.get(key) ?? 0;
  if (count <= 1) values.delete(key);
  else values.set(key, count - 1);
}

/** Retain a caller's cancellation reason or supply a safe fallback.
 * @returns The caller's original reason or a cancellation Error.
 * @param signal - Caller cancellation signal.
 */
export function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Admission cancelled");
}

/** Remove cancelled requests from the FIFO head without reordering survivors.
 * @returns Nothing; removes cancelled FIFO head entries.
 * @param state - Generation-local capacity state.
 */
export function discardCancelled(state: FunctionState): void {
  while (state.queue[0]?.cancelled) state.queue.shift();
}
