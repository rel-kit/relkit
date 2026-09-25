import type { ErrorRetry, ErrorRetryInput } from "./error-retry.js";

export type { ErrorRetry, ErrorRetryInput } from "./error-retry.js";

/** Stable category used by failure records and public envelopes.
 * @example const kind: FailureKind = "provider";
 */
export type FailureKind = "application" | "provider" | "cancellation" | "timeout" | "defect";
/** Stable invocation outcome independent of the error message.
 * @example const outcome: FailureOutcome = "cancelled";
 */
export type FailureOutcome =
  "declared-error" | "provider-failure" | "cancelled" | "timeout" | "defect";
/** Discriminant for the immutable failure variants.
 * @example const tag: FailureTag = "ApplicationFailure";
 */
export type FailureTag =
  "ApplicationFailure" | "ProviderFailure" | "Cancellation" | "Timeout" | "UnexpectedDefect";

/** Inputs for a declared application failure.
 * The declared ID and data are checked against the target's error definitions.
 * @example const options: ApplicationFailureOptions = { id: "orders.missing", message: "Missing", data: {} };
 */
export interface ApplicationFailureOptions {
  readonly id: string;
  readonly message: string;
  readonly data: unknown;
  readonly retry?: ErrorRetryInput;
  readonly afterMs?: number;
  readonly status?: number;
  readonly cause?: unknown;
}

/** Optional provider context recorded without exposing its internal cause.
 * These fields identify the failing capability while the cause stays local.
 * @example const options: ProviderFailureOptions = { capability: "cache", operation: "get" };
 */
export interface ProviderFailureOptions {
  readonly cause?: unknown;
  readonly capability?: string;
  readonly profile?: string;
  readonly operation?: string;
}

/** Common public fields shared by all invocation failures.
 * Code and message are safe to expose after normalization.
 * @example function report(failure: FailureBase) { return failure.code; }
 */
export interface FailureBase {
  readonly _tag: FailureTag;
  readonly kind: FailureKind;
  readonly outcome: FailureOutcome;
  readonly code: string;
  readonly message: string;
}

/** Declared application failure with typed retry metadata.
 * Its ID and data come from a target's declared error contract.
 * @example if (failure._tag === "ApplicationFailure") console.log(failure.id);
 */
export interface ApplicationFailure extends FailureBase {
  readonly _tag: "ApplicationFailure";
  readonly kind: "application";
  readonly outcome: "declared-error";
  readonly id: string;
  readonly data: unknown;
  readonly retry: ErrorRetry;
  readonly afterMs?: number;
  readonly status?: number;
}

/** Provider operation failure with bounded context.
 * Internal provider causes are retained separately from these public fields.
 * @example if (failure._tag === "ProviderFailure") console.log(failure.operation);
 */
export interface ProviderFailure extends FailureBase {
  readonly _tag: "ProviderFailure";
  readonly kind: "provider";
  readonly outcome: "provider-failure";
  readonly capability?: string;
  readonly profile?: string;
  readonly operation?: string;
}

/** Invocation stopped by a cancellation signal.
 * The public message does not expose the signal's original reason.
 * @example if (failure._tag === "Cancellation") return failure.outcome;
 */
export interface CancellationFailure extends FailureBase {
  readonly _tag: "Cancellation";
  readonly kind: "cancellation";
  readonly outcome: "cancelled";
}

/** Invocation stopped after its deadline.
 * This variant is distinct from a caller-initiated cancellation.
 * @example if (failure._tag === "Timeout") return failure.code;
 */
export interface TimeoutFailure extends FailureBase {
  readonly _tag: "Timeout";
  readonly kind: "timeout";
  readonly outcome: "timeout";
}

/** Unexpected internal defect represented as a safe public failure.
 * The original defect is available only to local telemetry.
 * @example if (failure._tag === "UnexpectedDefect") report(failure.code);
 */
export interface UnexpectedDefect extends FailureBase {
  readonly _tag: "UnexpectedDefect";
  readonly kind: "defect";
  readonly outcome: "defect";
}

/** Union of all normalized invocation failure variants.
 * Match on _tag to handle every public failure shape.
 * @example if (failure._tag === "Timeout") console.log(failure.code);
 */
export type InvocationFailure =
  ApplicationFailure | ProviderFailure | CancellationFailure | TimeoutFailure | UnexpectedDefect;

/** Context used to normalize an arbitrary thrown value.
 * The signal and timeout flag take precedence over generic error classification.
 * @example normalizeFailure(error, { signal: controller.signal });
 */
export interface NormalizeFailureOptions {
  readonly signal?: AbortSignal;
  readonly timedOut?: boolean;
  readonly source?: "application" | "provider";
  readonly provider?: Omit<ProviderFailureOptions, "cause">;
}

/** Serializable failure fields safe to send to an invocation caller.
 * Internal stack traces and provider causes are deliberately omitted.
 * @example const envelope: PublicFailureEnvelope = toPublicEnvelope(failure);
 */
export interface PublicFailureEnvelope {
  readonly kind: FailureKind;
  readonly outcome: FailureOutcome;
  readonly code: string;
  readonly message: string;
  readonly data?: import("@relkit/contracts").JsonValue;
  readonly status?: number;
  readonly retry?: ErrorRetry;
  readonly afterMs?: number;
}

/** Redacted internal diagnostic details retained for local telemetry.
 * Values must already be safe for JSON serialization.
 * @example const detail: RedactedFailureDetail = { cause: "connection lost" };
 */
export interface RedactedFailureDetail {
  readonly cause?: import("@relkit/contracts").JsonValue;
  readonly stack?: string;
}

/** Public failure fields plus optional internal diagnostic detail.
 * Never send the internal field to a remote invocation caller.
 * @example function record(telemetry: FailureTelemetry) { return telemetry.internal; }
 */
export interface FailureTelemetry extends PublicFailureEnvelope {
  readonly internal?: RedactedFailureDetail;
}

/** Controls telemetry redaction and environment-specific detail.
 * Production mode should retain only redacted diagnostic values.
 * @example const options: FailureTelemetryOptions = { mode: "production" };
 */
export interface FailureTelemetryOptions {
  readonly mode?: "development" | "test" | "production";
  /** Converts an internal value to safe JSON.
   * @param value - Internal diagnostic value.
   * @returns Redacted JSON suitable for local telemetry.
   * @example const redact = (value: unknown) => String(value);
   */
  readonly redact?: (value: unknown) => import("@relkit/contracts").JsonValue;
}
