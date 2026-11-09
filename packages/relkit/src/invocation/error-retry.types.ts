/** Retry policy for a declared application error.
 * @example const retry: ErrorRetry = "later";
 */
export type ErrorRetry = "never" | "later";

/** Delayed retry policy with an optional minimum delay.
 * afterMs must be a finite non-negative integer when supplied.
 * @example const retry: ErrorRetryLater = { kind: "later", afterMs: 500 };
 */
export interface ErrorRetryLater {
  readonly kind: "later";
  readonly afterMs?: number;
}

/** Accepted retry policy input.
 * Normalization validates the optional delay and freezes the result.
 * @example const retry: ErrorRetryInput = { kind: "later", afterMs: 500 };
 */
export type ErrorRetryInput = ErrorRetry | ErrorRetryLater;

/** Canonical immutable retry policy.
 * Normalization removes a delay when retry is never.
 * @example const policy = normalizeErrorRetry("later", 500);
 */
export interface NormalizedErrorRetry {
  readonly retry: ErrorRetry;
  readonly afterMs?: number;
}
