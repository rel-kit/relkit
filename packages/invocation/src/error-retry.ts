import { Data, Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { NormalizedErrorRetry } from "./error-retry.types.js";

export type {
  ErrorRetry,
  ErrorRetryInput,
  ErrorRetryLater,
  NormalizedErrorRetry,
} from "./error-retry.types.js";

/** Tagged failure for an invalid declared error retry policy.
 * @example Effect.catchTag(normalizeErrorRetryEffect("soon"), "ErrorRetryValidationError", () => Effect.void);
 */
export class ErrorRetryValidationError extends Data.TaggedError("ErrorRetryValidationError")<{
  readonly field: "retry" | "afterMs";
  readonly message: string;
}> {}

/** Normalizes a retry policy through the Effect error channel.
 * @param value - Retry policy or undefined for no retry.
 * @param afterMs - Optional retry delay in milliseconds.
 * @returns An immutable policy, or `ErrorRetryValidationError` for invalid input.
 * @example Effect.runSync(normalizeErrorRetryEffect({ kind: "later", afterMs: 100 }));
 */
export function normalizeErrorRetryEffect(
  value: unknown,
  afterMs?: unknown,
): Effect.Effect<NormalizedErrorRetry, ErrorRetryValidationError> {
  return observeInvocation(
    "retry.normalize",
    Effect.gen(function* () {
      if (value === undefined || value === "never") {
        if (afterMs !== undefined) return yield* Effect.fail(invalidRetry());
        return Object.freeze({ retry: "never" as const });
      }
      if (value === "later") return yield* later(afterMs);
      if (!isRecord(value) || value.kind !== "later") return yield* Effect.fail(invalidRetry());
      const nestedAfterMs = value.afterMs;
      if (afterMs !== undefined && nestedAfterMs !== undefined && afterMs !== nestedAfterMs)
        return yield* Effect.fail(invalidRetry());
      return yield* later(nestedAfterMs === undefined ? afterMs : nestedAfterMs);
    }),
  );
}

/** Compatibility adapter for synchronous callers.
 * @param value - Retry policy or undefined for no retry.
 * @param afterMs - Optional retry delay in milliseconds.
 * @returns An immutable normalized retry policy.
 * @throws TypeError when the policy or delay is invalid.
 * @example normalizeErrorRetry("later", 100);
 */
export function normalizeErrorRetry(value: unknown, afterMs?: unknown): NormalizedErrorRetry {
  try {
    return runInvocationSync(normalizeErrorRetryEffect(value, afterMs));
  } catch (cause) {
    if (cause instanceof ErrorRetryValidationError) throw new TypeError(cause.message);
    throw cause;
  }
}

function later(afterMs: unknown): Effect.Effect<NormalizedErrorRetry, ErrorRetryValidationError> {
  if (afterMs === undefined) return Effect.succeed(Object.freeze({ retry: "later" }));
  if (typeof afterMs !== "number" || !Number.isSafeInteger(afterMs) || afterMs < 0)
    return Effect.fail(invalidAfterMs());
  return Effect.succeed(Object.freeze({ retry: "later", afterMs }));
}

function invalidRetry(): ErrorRetryValidationError {
  return new ErrorRetryValidationError({
    field: "retry",
    message: 'Declared error retry must be "never", "later", or { kind: "later" }.',
  });
}

function invalidAfterMs(): ErrorRetryValidationError {
  return new ErrorRetryValidationError({
    field: "afterMs",
    message: "Declared error retry.afterMs must be a finite non-negative integer.",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
