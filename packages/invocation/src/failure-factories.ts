import { Effect } from "effect";
import { normalizeErrorRetryEffect, ErrorRetryValidationError } from "./error-retry.js";
import { requiredTextEffect, RequiredTextError } from "./failure-guards.js";
import { makeFailure } from "./failure-runtime.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type {
  ApplicationFailure,
  ApplicationFailureOptions,
  CancellationFailure,
  ProviderFailure,
  ProviderFailureOptions,
  TimeoutFailure,
  UnexpectedDefect,
} from "./failure-factories.types.js";

/** Constructs a declared application failure with validated retry metadata.
 * @param options - Error ID, message, data, retry policy, and cause.
 * @returns Frozen failure or tagged retry/text validation failure.
 * @example Effect.runSync(applicationFailureEffect({ id: "errors.duplicate", message: "Duplicate", data: null }));
 */
export function applicationFailureEffect(
  options: ApplicationFailureOptions,
): Effect.Effect<ApplicationFailure, ErrorRetryValidationError | RequiredTextError> {
  return observeInvocation("failure.application", Effect.gen(function* () {
    const retry = yield* normalizeErrorRetryEffect(options.retry, options.afterMs);
    const code = yield* requiredTextEffect(options.id, "application failure id");
    const message = yield* requiredTextEffect(options.message, "application failure message");
    return makeFailure({
      _tag: "ApplicationFailure",
      kind: "application",
      outcome: "declared-error",
      code,
      message,
      id: options.id,
      data: options.data,
      retry: retry.retry,
      ...(retry.afterMs === undefined ? {} : { afterMs: retry.afterMs }),
      ...(options.status === undefined ? {} : { status: options.status }),
    }, options.cause) as ApplicationFailure;
  }));
}

/** Synchronous declared application failure adapter.
 * @param options - Error ID, message, data, retry policy, and cause.
 * @returns Frozen application failure.
 * @throws TypeError for invalid ID, message, or retry policy.
 * @example applicationFailure({ id: "errors.duplicate", message: "Duplicate", data: null });
 */
export function applicationFailure(options: ApplicationFailureOptions): ApplicationFailure {
  try { return runInvocationSync(applicationFailureEffect(options)); }
  catch (cause) {
    if (cause instanceof ErrorRetryValidationError || cause instanceof RequiredTextError)
      throw new TypeError(cause.message);
    throw cause;
  }
}

/** Constructs a provider failure with its internal cause.
 * @param cause - Provider error.
 * @param options - Optional bounded provider context.
 * @returns Frozen provider failure with no expected error.
 * @example Effect.runSync(providerFailureEffect(new Error("offline")));
 */
export function providerFailureEffect(
  cause: unknown,
  options: Omit<ProviderFailureOptions, "cause"> = {},
): Effect.Effect<ProviderFailure> {
  return observeInvocation("failure.provider", Effect.sync(() => makeFailure({
    _tag: "ProviderFailure",
    kind: "provider",
    outcome: "provider-failure",
    code: "RELKIT_PROVIDER_FAILURE",
    message: "Provider operation failed",
    ...options,
  }, cause) as ProviderFailure));
}

/** Synchronous provider failure adapter.
 * @param cause - Provider error.
 * @param options - Optional provider context.
 * @returns Frozen provider failure.
 * @example providerFailure(new Error("offline"));
 */
export function providerFailure(
  cause: unknown,
  options: Omit<ProviderFailureOptions, "cause"> = {},
): ProviderFailure {
  return runInvocationSync(providerFailureEffect(cause, options));
}

/** Constructs a cancellation failure.
 * @param cause - Optional cancellation reason.
 * @returns Frozen cancellation failure with no expected error.
 * @example Effect.runSync(cancellationFailureEffect());
 */
export function cancellationFailureEffect(cause?: unknown): Effect.Effect<CancellationFailure> {
  return observeInvocation("failure.cancellation", Effect.sync(() => makeFailure({
    _tag: "Cancellation", kind: "cancellation", outcome: "cancelled",
    code: "RELKIT_CANCELLED", message: "Operation cancelled",
  }, cause) as CancellationFailure));
}

/** Synchronous cancellation failure adapter.
 * @param cause - Optional cancellation reason.
 * @returns Frozen cancellation failure.
 * @example cancellationFailure();
 */
export function cancellationFailure(cause?: unknown): CancellationFailure {
  return runInvocationSync(cancellationFailureEffect(cause));
}

/** Constructs a timeout failure.
 * @param cause - Optional timeout reason.
 * @returns Frozen timeout failure with no expected error.
 * @example Effect.runSync(timeoutFailureEffect());
 */
export function timeoutFailureEffect(cause?: unknown): Effect.Effect<TimeoutFailure> {
  return observeInvocation("failure.timeout", Effect.sync(() => makeFailure({
    _tag: "Timeout", kind: "timeout", outcome: "timeout",
    code: "RELKIT_TIMEOUT", message: "Operation timed out",
  }, cause) as TimeoutFailure));
}

/** Synchronous timeout failure adapter.
 * @param cause - Optional timeout reason.
 * @returns Frozen timeout failure.
 * @example timeoutFailure();
 */
export function timeoutFailure(cause?: unknown): TimeoutFailure {
  return runInvocationSync(timeoutFailureEffect(cause));
}

/** Constructs an unexpected defect failure.
 * @param cause - Optional internal cause.
 * @param options - Optional public code and message.
 * @returns Frozen defect failure with no expected error.
 * @example Effect.runSync(unexpectedDefectEffect(new Error("broken")));
 */
export function unexpectedDefectEffect(
  cause?: unknown,
  options?: { readonly code?: string; readonly message?: string },
): Effect.Effect<UnexpectedDefect> {
  return observeInvocation("failure.defect", Effect.sync(() => makeFailure({
    _tag: "UnexpectedDefect", kind: "defect", outcome: "defect",
    code: options?.code ?? "RELKIT_UNEXPECTED_DEFECT",
    message: options?.message ?? "Unexpected internal error",
  }, cause) as UnexpectedDefect));
}

/** Synchronous unexpected defect adapter.
 * @param cause - Optional internal cause.
 * @param options - Optional public code and message.
 * @returns Frozen defect failure.
 * @example unexpectedDefect(new Error("broken"));
 */
export function unexpectedDefect(
  cause?: unknown,
  options?: { readonly code?: string; readonly message?: string },
): UnexpectedDefect {
  return runInvocationSync(unexpectedDefectEffect(cause, options));
}

/** Compatibility alias for a synchronous unexpected defect.
 * @param cause - Internal cause. @param options - Public code and message.
 * @returns Frozen defect failure.
 * @example defectFailure(new Error("broken"));
 */
export const defectFailure = unexpectedDefect;
/** Compatibility alias for an observed unexpected defect Effect.
 * @param cause - Internal cause. @param options - Public code and message.
 * @returns Effect producing a frozen defect with no expected failure.
 * @example Effect.runSync(defectFailureEffect(new Error("broken")));
 */
export const defectFailureEffect = unexpectedDefectEffect;
