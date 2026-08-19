export type FailureKind = "application" | "provider" | "cancellation" | "timeout" | "defect";
export type FailureOutcome =
  "declared-error" | "provider-failure" | "cancelled" | "timeout" | "defect";
export type ErrorRetry = "never" | "later";
export type FailureTag =
  "ApplicationFailure" | "ProviderFailure" | "Cancellation" | "Timeout" | "UnexpectedDefect";

export interface ApplicationFailureOptions {
  readonly id: string;
  readonly message: string;
  readonly data: unknown;
  readonly retry?: ErrorRetry;
  readonly status?: number;
  readonly cause?: unknown;
}
export interface ProviderFailureOptions {
  readonly cause?: unknown;
  readonly capability?: string;
  readonly profile?: string;
  readonly operation?: string;
}
export interface FailureBase {
  readonly _tag: FailureTag;
  readonly kind: FailureKind;
  readonly outcome: FailureOutcome;
  readonly code: string;
  readonly message: string;
}
export interface ApplicationFailure extends FailureBase {
  readonly _tag: "ApplicationFailure";
  readonly kind: "application";
  readonly outcome: "declared-error";
  readonly id: string;
  readonly data: unknown;
  readonly retry: ErrorRetry;
  readonly status?: number;
}
export interface ProviderFailure extends FailureBase {
  readonly _tag: "ProviderFailure";
  readonly kind: "provider";
  readonly outcome: "provider-failure";
  readonly capability?: string;
  readonly profile?: string;
  readonly operation?: string;
}
export interface CancellationFailure extends FailureBase {
  readonly _tag: "Cancellation";
  readonly kind: "cancellation";
  readonly outcome: "cancelled";
}
export interface TimeoutFailure extends FailureBase {
  readonly _tag: "Timeout";
  readonly kind: "timeout";
  readonly outcome: "timeout";
}
export interface UnexpectedDefect extends FailureBase {
  readonly _tag: "UnexpectedDefect";
  readonly kind: "defect";
  readonly outcome: "defect";
}
export type InvocationFailure =
  ApplicationFailure | ProviderFailure | CancellationFailure | TimeoutFailure | UnexpectedDefect;
export interface NormalizeFailureOptions {
  readonly signal?: AbortSignal;
  readonly timedOut?: boolean;
  readonly source?: "application" | "provider";
  readonly provider?: Omit<ProviderFailureOptions, "cause">;
}
export interface PublicFailureEnvelope {
  readonly kind: FailureKind;
  readonly outcome: FailureOutcome;
  readonly code: string;
  readonly message: string;
  readonly data?: import("@zsys/contracts").JsonValue;
  readonly status?: number;
  readonly retry?: ErrorRetry;
}
export interface RedactedFailureDetail {
  readonly cause?: import("@zsys/contracts").JsonValue;
  readonly stack?: string;
}
export interface FailureTelemetry extends PublicFailureEnvelope {
  readonly internal?: RedactedFailureDetail;
}
export interface FailureTelemetryOptions {
  readonly mode?: "development" | "test" | "production";
  readonly redact?: (value: unknown) => import("@zsys/contracts").JsonValue;
}
