import type { RetryPolicy } from "./define-job.js";

export function validateRetry(value: RetryPolicy): RetryPolicy {
  if (!isRecord(value)) throw new TypeError("Job retry policy is required");
  positiveInteger(value.maxAttempts, "retry.maxAttempts");
  nonNegativeInteger(value.initialDelayMs, "retry.initialDelayMs");
  nonNegativeInteger(value.maxDelayMs, "retry.maxDelayMs");
  if (value.maxDelayMs < value.initialDelayMs) {
    throw new TypeError("retry.maxDelayMs must be at least retry.initialDelayMs");
  }
  if (!Number.isFinite(value.multiplier) || value.multiplier < 1) {
    throw new TypeError("retry.multiplier must be a finite number at least 1");
  }
  if (value.jitter !== "none" && value.jitter !== "full" && value.jitter !== "equal") {
    throw new TypeError("retry.jitter must be none, full, or equal");
  }
  return Object.freeze({ ...value });
}

function positiveInteger(value: unknown, name: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

function nonNegativeInteger(value: unknown, name: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
