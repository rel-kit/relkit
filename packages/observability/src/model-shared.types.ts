import type { JsonPrimitive, JsonValue } from "@relkit/contracts";

/** The current version of every observability model record. */
export type ObservabilityModelVersion =
  typeof import("./model-shared.js").OBSERVABILITY_MODEL_VERSION;

/** A completed request's canonical outcome. */
export type RequestOutcome = (typeof import("./model-shared.js").REQUEST_OUTCOMES)[number];

/** The signal family carried by a versioned observability record. */
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

/** The runtime boundary that began an invocation. */
export type InvocationSource =
  "direct" | "http" | "job" | "event-delivery" | "event-replay" | "tool" | "agent";

/** Invocation outcomes, including provider failures. */
export type InvocationOutcome = RequestOutcome | "provider-failure";

/** JSON-safe diagnostic fields. */
export type SafeFields = Readonly<Record<string, JsonValue>>;

/** Primitive-valued attributes safe for span export. */
export type SafeAttributes = Readonly<Record<string, JsonPrimitive>>;

/**
 * Correlation fields shared by every signal without executable values.
 *
 * @example
 * const correlation: ObservabilityCorrelation = { requestId: "request-1" };
 */
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

/**
 * Base contract for a versioned signal record.
 *
 * @example
 * interface CustomRecord extends VersionedRecord<"log"> { readonly message: string }
 */
export interface VersionedRecord<
  Signal extends ObservabilitySignal,
> extends ObservabilityCorrelation {
  readonly version: ObservabilityModelVersion;
  readonly signal: Signal;
}
