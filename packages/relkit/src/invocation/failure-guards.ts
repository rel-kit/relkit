import { Effect } from "effect";
import { normalizeErrorRetryEffect } from "./error-retry.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { DeclaredErrorLike, FunctionFailureLike } from "./failure-guards.types.js";

export type { DeclaredErrorLike, FunctionFailureLike } from "./failure-guards.types.js";
export {
  isCancellation,
  isCancellationEffect,
  isDependencyNotConfigured,
  isDependencyNotConfiguredEffect,
  isProviderError,
  isProviderErrorEffect,
  isTimeout,
  isTimeoutEffect,
  requiredText,
  requiredTextEffect,
  RequiredTextError,
} from "./failure-signals.js";

/** Recognizes a function failure wrapper inside Effect.
 * @param value - Candidate failure.
 * @returns Whether the value has a function failure payload; no expected failure.
 * @example Effect.runSync(isFunctionFailureEffect({ _tag: "FunctionFailure", error: 1 }));
 */
export function isFunctionFailureEffect(value: unknown): Effect.Effect<boolean> {
  return observeInvocation(
    "failure.is-function",
    Effect.sync(() => isRecord(value) && value._tag === "FunctionFailure" && "error" in value),
  );
}

/** Synchronous function failure type guard.
 * @param value - Candidate failure.
 * @returns Whether it wraps a function error.
 * @example isFunctionFailure({ _tag: "FunctionFailure", error: 1 });
 */
export function isFunctionFailure(value: unknown): value is FunctionFailureLike {
  return runInvocationSync(isFunctionFailureEffect(value));
}

/** Recognizes a declared error, including its retry policy.
 * @param value - Candidate declared error.
 * @returns Whether the value has valid declared error metadata; no expected failure.
 * @example Effect.runSync(isDeclaredErrorEffect(new Error("failed")));
 */
export function isDeclaredErrorEffect(value: unknown): Effect.Effect<boolean> {
  return observeInvocation(
    "failure.is-declared",
    Effect.gen(function* () {
      if (!(value instanceof Error) || value.name !== "DeclaredError" || !isRecord(value))
        return false;
      const ref = value.ref;
      if (
        typeof value.id !== "string" ||
        typeof value.message !== "string" ||
        !isRecord(ref) ||
        ref.kind !== "error" ||
        ref.id !== value.id
      )
        return false;
      return yield* Effect.match(normalizeErrorRetryEffect(value.retry, value.afterMs), {
        onFailure: () => false,
        onSuccess: () => true,
      });
    }),
  );
}

/** Synchronous declared error type guard.
 * @param value - Candidate declared error.
 * @returns Whether the value is a valid declared error.
 * @example isDeclaredError(new Error("failed"));
 */
export function isDeclaredError(value: unknown): value is DeclaredErrorLike {
  return runInvocationSync(isDeclaredErrorEffect(value));
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object";
}
