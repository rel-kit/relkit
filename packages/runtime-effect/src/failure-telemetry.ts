import { readFailureDetail } from "./failure-internals.js";
import { normalizeFailure, toPublicEnvelope } from "./failure.js";
import { redactFailureDetail } from "./failure-redaction.js";
import type { FailureTelemetry, FailureTelemetryOptions } from "./failure-types.js";

export type { FailureTelemetry, FailureTelemetryOptions } from "./failure-types.js";

/**
 * Adds bounded development detail to the safe public failure envelope.
 * @param value - Original failure or error.
 * @param options - Mode and optional redaction policy.
 * @returns A safe failure envelope with internal detail only in development.
 */
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
