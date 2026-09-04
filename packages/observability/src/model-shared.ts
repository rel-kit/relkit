import type { JsonPrimitive, JsonValue } from "@relkit/contracts";

/** Version of the JSON-safe observability record contracts. */
export const OBSERVABILITY_MODEL_VERSION = 2 as const;
export const OBSERVABILITY_VERSION = OBSERVABILITY_MODEL_VERSION;
export type ObservabilityModelVersion = typeof OBSERVABILITY_MODEL_VERSION;

/** Request outcomes defined by the v3 HTTP contract. */
export const REQUEST_OUTCOMES = [
  "success",
  "declared-error",
  "validation-error",
  "timeout",
  "cancelled",
  "defect",
] as const;
export type RequestOutcome = (typeof REQUEST_OUTCOMES)[number];

export type ObservabilitySignal =
  | "request"
  | "invocation"
  | "job"
  | "event"
  | "operation"
  | "tool"
  | "agent"
  | "log"
  | "span"
  | "trace"
  | "diagnostic"
  | "generation";
export type InvocationSource =
  "direct" | "http" | "job" | "event-delivery" | "event-replay" | "tool" | "agent";
export type InvocationOutcome = RequestOutcome | "provider-failure";
export type SafeFields = Readonly<Record<string, JsonValue>>;
export type SafeAttributes = Readonly<Record<string, JsonPrimitive>>;

/** Correlation fields shared by every signal without carrying executable values. */
export interface ObservabilityCorrelation {
  readonly requestId?: string;
  readonly originRequestId?: string;
  readonly traceId?: string;
  readonly invocationId?: string;
  readonly serviceId?: string;
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly correlationId?: string;
}

export interface VersionedRecord<
  Signal extends ObservabilitySignal,
> extends ObservabilityCorrelation {
  readonly version: ObservabilityModelVersion;
  readonly signal: Signal;
}
