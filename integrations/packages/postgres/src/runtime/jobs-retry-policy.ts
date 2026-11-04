/**
 * Pure retry decisions for failed job attempts. It reads the task's declared
 * `policy.retry` (attempt budget, exponential backoff, optional full jitter)
 * from the stored submission and the failure's own `retry`/`afterMs` hints,
 * matching the local provider so a task behaves the same on both backends.
 */
import type { JsonValue } from "relkit/contracts";
import type { JobErrorEnvelope } from "relkit/contracts/jobs";
import { durationToMillis } from "relkit/jobs";

type JsonRecord = { readonly [key: string]: JsonValue };

/**
 * Normalizes a thrown task failure into the public error envelope.
 * @param value - Value the task threw or rejected with.
 * @returns Code, message and retry hints; arbitrary objects are not retained.
 */
export function failureOf(value: Error | JsonValue | object | undefined): JobErrorEnvelope {
  const record = value as {
    code?: JsonValue;
    message?: JsonValue;
    retry?: JsonValue;
    afterMs?: JsonValue;
  };
  if (value !== null && typeof value === "object" && typeof record.code === "string")
    return {
      code: record.code,
      message: typeof record.message === "string" ? record.message : record.code,
      ...(record.retry === "never" || record.retry === "later" ? { retry: record.retry } : {}),
      ...(typeof record.afterMs === "number" ? { afterMs: record.afterMs } : {}),
    };
  return {
    code: value instanceof Error ? value.name : "RELKIT_TASK_FAILED",
    message: value instanceof Error ? value.message : String(value),
  };
}

/**
 * Reads the attempt budget declared by the task policy.
 * @param policy - Stored task policy.
 * @returns The maximum number of attempts; 1 when no retry policy is declared.
 */
export function maxAttempts(policy: JsonValue | undefined): number {
  return positiveInteger(retryPolicy(policy)?.maxAttempts, 1);
}

/**
 * Decides whether a failed attempt runs again and after how long.
 * @param policy - Stored task policy.
 * @param attempt - One-based attempt that just failed.
 * @param failure - Normalized failure.
 * @param random - Jitter source in [0, 1).
 * @returns Delay in ms before the next attempt, or undefined when the run ends failed.
 */
export function retryDelay(
  policy: JsonValue | undefined,
  attempt: number,
  failure: JobErrorEnvelope,
  random: () => number = Math.random,
): number | undefined {
  const retry = retryPolicy(policy);
  if (retry === undefined || failure.retry === "never") return undefined;
  if (attempt >= positiveInteger(retry.maxAttempts, 1)) return undefined;
  const initial = durationMillis(retry.initialDelayMs ?? retry.initialDelay, 0);
  const maximum = durationMillis(retry.maxDelayMs ?? retry.maxDelay, Math.max(initial, 1));
  const factor = typeof retry.multiplier === "number" ? retry.multiplier : 1;
  const base = Math.min(maximum, initial * Math.pow(Math.max(1, factor), Math.max(0, attempt - 1)));
  const delay = retry.jitter === "full" ? Math.floor(random() * (base + 1)) : Math.floor(base);
  return Math.max(failure.afterMs ?? 0, delay);
}

/**
 * Narrows the `retry` member of a stored policy.
 * @param policy - Stored task policy.
 * @returns The retry record, or undefined.
 */
function retryPolicy(policy: JsonValue | undefined): JsonRecord | undefined {
  if (policy === null || typeof policy !== "object" || Array.isArray(policy)) return undefined;
  const retry = (policy as JsonRecord).retry;
  return retry !== null && typeof retry === "object" && !Array.isArray(retry)
    ? (retry as JsonRecord)
    : undefined;
}

/**
 * Reads a millisecond count or duration text.
 * @param value - Policy value.
 * @param fallback - Value used when absent or invalid.
 * @returns Milliseconds.
 */
function durationMillis(value: JsonValue | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value !== "string") return fallback;
  try {
    return durationToMillis(value as Parameters<typeof durationToMillis>[0]);
  } catch {
    return fallback;
  }
}

/**
 * Reads a positive safe integer.
 * @param value - Policy value.
 * @param fallback - Value used when absent or invalid.
 * @returns The integer.
 */
function positiveInteger(value: JsonValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}
