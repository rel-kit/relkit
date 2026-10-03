import { canonicalJson, type JsonValue } from "@relkit/contracts";
import type { RetryPolicy } from "@relkit/jobs/legacy";
import { readEntry } from "../jobs/queue-entry.js";
import { normalizeEnvelope } from "./router-records.js";

/** Rejects malformed delivery payloads during durable journal recovery.
 * @param value - Value to validate, normalize or project.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
export function validateStoredData(value: JsonValue): void {
  if (isRecord(value) && value.input !== undefined) {
    readEntry({
      version: 1,
      sequence: 1,
      instanceId: "delivery.validation",
      kind: "available",
      timestamp: 0,
      data: value,
    });
    normalizeEnvelope(value.input);
    return;
  }
  if (isRecord(value) && value.envelope !== undefined) {
    normalizeEnvelope(value.envelope);
    return;
  }
  normalizeEnvelope(value);
}

/** Validates or supplies the effective delivery retry policy.
 * @param value - Value to validate, normalize or project.
 * @returns The effective validated retry policy.
 */
export function normalizeRetry(value: RetryPolicy | undefined): RetryPolicy {
  const policy = value ?? DEFAULT_RETRY;
  positive(policy.maxAttempts, "retry.maxAttempts");
  nonNegative(policy.initialDelayMs, "retry.initialDelayMs");
  nonNegative(policy.maxDelayMs, "retry.maxDelayMs");
  if (policy.maxDelayMs < policy.initialDelayMs || policy.multiplier < 1)
    throw new TypeError("Event retry policy is invalid");
  if (!["none", "full", "equal"].includes(policy.jitter))
    throw new TypeError("Event retry policy jitter is invalid");
  return Object.freeze({ ...policy });
}

/** Validates a positive safe capacity or concurrency bound.
 * @param value - Value to validate, normalize or project.
 * @param name - Required field name used in diagnostics.
 * @returns The validated positive safe count.
 */
export function positive(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be positive`);
  return value;
}

/** Copies values through canonical JSON before durable delivery storage.
 * @param value - Value to validate, normalize or project.
 * @returns The canonical JSON copy.
 */
export function json(value: unknown): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}

/** Validates a nonnegative safe delivery counter.
 * @param value - Value to validate, normalize or project.
 * @param name - Required field name used in diagnostics.
 * @returns The validated nonnegative safe count.
 */
export function nonNegative(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${name} must be non-negative`);
  return value;
}

/** Checks for a non-null, non-array object before inspecting unknown fields.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a non-null, non-array object.
 */
export function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Default durable delivery policy performs a single attempt without retry delay. */
export const DEFAULT_RETRY: RetryPolicy = Object.freeze({
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none",
});
