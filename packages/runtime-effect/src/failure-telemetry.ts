import { readFailureDetail } from "./failure-internals.js";
import { normalizeFailure, toPublicEnvelope } from "./failure.js";
import { redactFailureDetail } from "./failure-redaction.js";
import type { FailureTelemetry, FailureTelemetryOptions } from "./failure-types.js";

export type { FailureTelemetry, FailureTelemetryOptions } from "./failure-types.js";

/** Adds bounded, redacted detail only for development telemetry. */
export function toFailureTelemetry(
  value: unknown,
  options: FailureTelemetryOptions = {},
): FailureTelemetry {
  const failure = normalizeFailure(value);
  const envelope = toPublicEnvelope(failure);
  if (options.mode !== "development") return envelope;
  const detail = readFailureDetail(failure);
  if (detail === undefined) return envelope;
  const redact = options.redact ?? redactFailureDetail;
  const cause = detail.cause === undefined ? undefined : redact(detail.cause);
  const stack = detail.stack === undefined ? undefined : redact(detail.stack);
  const internal = {
    ...(cause === undefined ? {} : { cause }),
    ...(typeof stack === "string" ? { stack } : {}),
  };
  return Object.keys(internal).length === 0 ? envelope : { ...envelope, internal };
}

export const toTelemetry = toFailureTelemetry;
