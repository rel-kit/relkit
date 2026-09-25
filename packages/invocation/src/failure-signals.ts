import { Cause, Data, Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";

/** Typed failure for an empty required failure field.
 * @example Effect.catchTag(requiredTextEffect("", "id"), "RequiredTextError", () => Effect.void);
 */
export class RequiredTextError extends Data.TaggedError("RequiredTextError")<{
  readonly field: string;
  readonly message: string;
}> {}

/** Recognizes a provider failure marker.
 * @param value - Candidate failure.
 * @returns Whether it has a provider marker; no expected failure.
 * @example Effect.runSync(isProviderErrorEffect({ _tag: "ProviderError" }));
 */
export function isProviderErrorEffect(value: unknown): Effect.Effect<boolean> {
  return observeInvocation(
    "failure.is-provider",
    Effect.sync(
      () => isRecord(value) && (value._tag === "ProviderError" || value.name === "ProviderError"),
    ),
  );
}

/** Synchronous provider failure guard.
 * @param value - Candidate failure.
 * @returns Whether it has a provider marker.
 * @example isProviderError({ _tag: "ProviderError" });
 */
export function isProviderError(value: unknown): boolean {
  return runInvocationSync(isProviderErrorEffect(value));
}

/** Recognizes an absent managed dependency.
 * @param value - Candidate failure.
 * @returns Whether it has dependency metadata; no expected failure.
 * @example Effect.runSync(isDependencyNotConfiguredEffect({ name: "DependencyNotConfiguredError", category: "jobs", dependencyName: "publish" }));
 */
export function isDependencyNotConfiguredEffect(value: unknown): Effect.Effect<boolean> {
  return observeInvocation(
    "failure.is-dependency",
    Effect.sync(
      () =>
        isRecord(value) &&
        value.name === "DependencyNotConfiguredError" &&
        typeof value.category === "string" &&
        typeof value.dependencyName === "string",
    ),
  );
}

/** Synchronous absent dependency type guard.
 * @param value - Candidate failure.
 * @returns Whether it has dependency metadata.
 * @example isDependencyNotConfigured(new Error("missing"));
 */
export function isDependencyNotConfigured(value: unknown): value is {
  readonly name: "DependencyNotConfiguredError";
  readonly category: string;
  readonly dependencyName: string;
} {
  return runInvocationSync(isDependencyNotConfiguredEffect(value));
}

/** Recognizes cancellation from common provider error shapes.
 * @param value - Candidate failure.
 * @returns Whether it signals cancellation; no expected failure.
 * @example Effect.runSync(isCancellationEffect(new DOMException("stop", "AbortError")));
 */
export function isCancellationEffect(value: unknown): Effect.Effect<boolean> {
  return observeInvocation(
    "failure.is-cancellation",
    Effect.sync(
      () =>
        isRecord(value) &&
        (value.name === "AbortError" ||
          value.name === "CanceledError" ||
          value.code === "ABORT_ERR" ||
          value.code === "ERR_ABORTED" ||
          value._tag === "Abort"),
    ),
  );
}

/** Synchronous cancellation guard.
 * @param value - Candidate failure.
 * @returns Whether it signals cancellation.
 * @example isCancellation(new DOMException("stop", "AbortError"));
 */
export function isCancellation(value: unknown): boolean {
  return runInvocationSync(isCancellationEffect(value));
}

/** Recognizes Effect and provider timeout errors.
 * @param value - Candidate failure.
 * @returns Whether it signals a timeout; no expected failure.
 * @example Effect.runSync(isTimeoutEffect(new Cause.TimeoutError()));
 */
export function isTimeoutEffect(value: unknown): Effect.Effect<boolean> {
  return observeInvocation(
    "failure.is-timeout",
    Effect.sync(
      () =>
        Cause.isTimeoutError(value) ||
        (isRecord(value) &&
          (value.name === "TimeoutError" ||
            value._tag === "TimeoutError" ||
            value.code === "ETIMEDOUT")),
    ),
  );
}

/** Synchronous timeout guard.
 * @param value - Candidate failure.
 * @returns Whether it signals a timeout.
 * @example isTimeout(new Cause.TimeoutError());
 */
export function isTimeout(value: unknown): boolean {
  return runInvocationSync(isTimeoutEffect(value));
}

/** Requires non-empty text in the Effect error channel.
 * @param value - Candidate field value.
 * @param label - Field name for a failure message.
 * @returns Original value or `RequiredTextError`.
 * @example Effect.runSync(requiredTextEffect("orders.not-found", "id"));
 */
export function requiredTextEffect(
  value: string,
  label: string,
): Effect.Effect<string, RequiredTextError> {
  return observeInvocation(
    "failure.required-text",
    Effect.suspend(() =>
      value.trim().length > 0
        ? Effect.succeed(value)
        : Effect.fail(
            new RequiredTextError({ field: label, message: `${label} must be non-empty` }),
          ),
    ),
  );
}

/** Synchronous required text compatibility adapter.
 * @param value - Candidate field value.
 * @param label - Field name for a failure message.
 * @returns Original non-empty value.
 * @throws TypeError when the value is empty or whitespace.
 * @example requiredText("orders.not-found", "id");
 */
export function requiredText(value: string, label: string): string {
  try {
    return runInvocationSync(requiredTextEffect(value, label));
  } catch (cause) {
    if (cause instanceof RequiredTextError) throw new TypeError(cause.message);
    throw cause;
  }
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object";
}
