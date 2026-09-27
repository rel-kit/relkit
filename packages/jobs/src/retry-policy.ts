import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type { LegacyRetryPolicy } from "./retry-policy.types.js";

/** An invalid authored legacy retry policy.
 * @example new RetryPolicyValidationError({ reason: "retry.maxAttempts must be positive" });
 */
export class RetryPolicyValidationError extends Schema.TaggedError<RetryPolicyValidationError>()(
  "Jobs.RetryPolicyValidationError",
  { reason: Schema.String },
) {}

/** Validates legacy retry policy fields in Effect.
 * @param value - Authored policy, treated as untrusted at runtime.
 * @returns A frozen policy or RetryPolicyValidationError.
 * @example Effect.runPromise(validateRetryEffect({ maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" }));
 */
export const validateRetryEffect = Effect.fn("Jobs.validateRetry")(
  function* (value: LegacyRetryPolicy) {
    const fail = (reason: string) => Effect.fail(new RetryPolicyValidationError({ reason }));
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return yield* fail("Job retry policy is required");
    if (!Number.isSafeInteger(value.maxAttempts) || value.maxAttempts < 1)
      return yield* fail("retry.maxAttempts must be a positive integer");
    if (!Number.isSafeInteger(value.initialDelayMs) || value.initialDelayMs < 0)
      return yield* fail("retry.initialDelayMs must be a non-negative integer");
    if (!Number.isSafeInteger(value.maxDelayMs) || value.maxDelayMs < 0)
      return yield* fail("retry.maxDelayMs must be a non-negative integer");
    if (value.maxDelayMs < value.initialDelayMs)
      return yield* fail("retry.maxDelayMs must be at least retry.initialDelayMs");
    if (!Number.isFinite(value.multiplier) || value.multiplier < 1)
      return yield* fail("retry.multiplier must be a finite number at least 1");
    if (value.jitter !== "none" && value.jitter !== "full" && value.jitter !== "equal")
      return yield* fail("retry.jitter must be none, full, or equal");
    return Object.freeze({ ...value });
  },
  (effect) => observeJobs("retry.validate", effect),
);

/** Synchronous legacy retry policy validator.
 * @param value - Authored policy.
 * @returns A frozen validated copy.
 * @throws TypeError when any retry field is invalid.
 * @example validateRetry({ maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" });
 */
export function validateRetry(value: LegacyRetryPolicy): LegacyRetryPolicy {
  const result = Effect.runSync(Effect.result(validateRetryEffect(value)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
  return result.success;
}
