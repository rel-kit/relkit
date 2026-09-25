import { Cause, Data, Effect } from "effect";
import {
  isCancellation,
  isDeclaredError,
  isDependencyNotConfigured,
  isFunctionFailure,
  isProviderError,
  isTimeout,
} from "./failure-guards.js";
import { dependencyNotConfiguredFailure } from "./failure-dependency.js";
import { normalizeErrorRetry } from "./error-retry.js";
import {
  applicationFailure,
  cancellationFailure,
  providerFailure,
  timeoutFailure,
  unexpectedDefect,
} from "./failure-factories.js";
import { RuntimeFailure } from "./failure-runtime.js";
import { RecursionPolicyError } from "./recursion.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { InvocationFailure, NormalizeFailureOptions } from "./failure-normalize.types.js";

/** Tagged failure for malformed declared failure metadata.
 * @example Effect.catchTag(normalizeFailureEffect(value), "FailureNormalizationError", () => Effect.void);
 */
export class FailureNormalizationError extends Data.TaggedError("FailureNormalizationError")<{
  readonly cause: TypeError;
  readonly message: string;
}> {}

/** Normalizes a thrown value or Effect Cause to a stable invocation failure.
 * @param value - Thrown value or Effect Cause.
 * @param options - Source, timeout, provider, and signal context.
 * @returns An invocation failure or tagged malformed metadata error.
 * @example Effect.runSync(normalizeFailureEffect(new Error("broken")));
 */
export function normalizeFailureEffect(
  value: unknown,
  options: NormalizeFailureOptions = {},
): Effect.Effect<InvocationFailure, FailureNormalizationError> {
  return observeInvocation("failure.normalize", Effect.suspend(() => {
    try {
      if (isInvocationFailureValue(value)) return Effect.succeed(value);
      if (Cause.isCause(value)) {
        if (options.timedOut) return Effect.succeed(timeoutFailure(value));
        if (Cause.hasInterruptsOnly(value) || options.signal?.aborted)
          return Effect.succeed(cancellationFailure(value));
        const reason = value.reasons.find((entry) => !Cause.isInterruptReason(entry));
        if (reason === undefined) return Effect.succeed(cancellationFailure(value));
        const inner = Cause.isFailReason(reason) ? reason.error
          : Cause.isDieReason(reason) ? reason.defect : reason;
        return Effect.succeed(normalizeValue(inner, value, options));
      }
      return Effect.succeed(normalizeValue(value, value, options));
    } catch (cause) {
      if (cause instanceof TypeError)
        return Effect.fail(new FailureNormalizationError({ cause, message: cause.message }));
      return Effect.die(cause);
    }
  }));
}

/** Synchronous normalization adapter.
 * @param value - Thrown value or Effect Cause.
 * @param options - Source, timeout, provider, and signal context.
 * @returns A stable invocation failure.
 * @throws TypeError for malformed declared failure metadata.
 * @example normalizeFailure(new Error("broken"));
 */
export function normalizeFailure(value: unknown, options: NormalizeFailureOptions = {}): InvocationFailure {
  try { return runInvocationSync(normalizeFailureEffect(value, options)); }
  catch (cause) {
    if (cause instanceof FailureNormalizationError) throw cause.cause;
    throw cause;
  }
}

/** Checks whether a value is a runtime invocation failure.
 * @param value - Candidate value.
 * @returns True for a RuntimeFailure; no expected error.
 * @example Effect.runSync(isInvocationFailureEffect(value));
 */
export function isInvocationFailureEffect(value: unknown): Effect.Effect<boolean> {
  return observeInvocation("failure.is-invocation", Effect.sync(() => isInvocationFailureValue(value)));
}

/** Synchronous invocation failure predicate adapter.
 * @param value - Candidate value.
 * @returns True for a RuntimeFailure.
 * @example isInvocationFailure(value);
 */
export function isInvocationFailure(value: unknown): value is InvocationFailure {
  return runInvocationSync(isInvocationFailureEffect(value));
}

function isInvocationFailureValue(value: unknown): value is InvocationFailure {
  return value instanceof RuntimeFailure;
}

function normalizeValue(value: unknown, detail: unknown, options: NormalizeFailureOptions): InvocationFailure {
  if (value instanceof RecursionPolicyError)
    return unexpectedDefect(detail, { code: value.code, message: "Invocation denied by recursion policy" });
  if (isFunctionFailure(value)) return normalizeValue(value.error, detail, options);
  if (options.timedOut || isTimeout(value)) return timeoutFailure(detail);
  if (options.signal?.aborted || isCancellation(value)) return cancellationFailure(detail);
  if (isDependencyNotConfigured(value)) return dependencyNotConfiguredFailure(value);
  if (isDeclaredError(value)) {
    const retry = normalizeErrorRetry(value.retry, value.afterMs);
    return applicationFailure({
      id: value.id,
      data: value.data,
      message: value.message,
      retry: retry.retry,
      ...(retry.afterMs === undefined ? {} : { afterMs: retry.afterMs }),
      ...(value.http === undefined ? {} : { status: value.http.status }),
      cause: detail,
    });
  }
  if (options.source === "provider" || isProviderError(value))
    return providerFailure(detail, options.provider);
  return unexpectedDefect(detail);
}
