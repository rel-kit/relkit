import { normalizeId } from "@relkit/contracts";
import type { RetryPolicy } from "@relkit/jobs";
import type { EventDelivery } from "./event-function-types.js";

const DEFAULT_RETRY: RetryPolicy = Object.freeze({
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none",
});

export function eventDelivery(value: unknown): EventDelivery {
  if (value === undefined) return "durable";
  if (value !== "ephemeral" && value !== "durable") {
    throw new TypeError("Event function delivery must be ephemeral or durable");
  }
  return value;
}

export function eventProfile(value: unknown): string {
  if (value === undefined) return "default";
  if (typeof value !== "string") throw new TypeError("Event function profile must be a string");
  return normalizeId(value);
}

export function eventRetry(value: unknown): RetryPolicy {
  if (value === undefined) return DEFAULT_RETRY;
  if (!isRecord(value)) throw new TypeError("Event function retry must be an object");
  const retry = { ...DEFAULT_RETRY, ...value } as RetryPolicy;
  positive(retry.maxAttempts, "retry.maxAttempts");
  nonNegative(retry.initialDelayMs, "retry.initialDelayMs");
  nonNegative(retry.maxDelayMs, "retry.maxDelayMs");
  if (retry.maxDelayMs < retry.initialDelayMs) {
    throw new TypeError("retry.maxDelayMs must be at least retry.initialDelayMs");
  }
  if (!Number.isFinite(retry.multiplier) || retry.multiplier < 1) {
    throw new TypeError("retry.multiplier must be a finite number at least 1");
  }
  if (retry.jitter !== "none" && retry.jitter !== "full" && retry.jitter !== "equal") {
    throw new TypeError("retry.jitter must be none, full, or equal");
  }
  return Object.freeze(retry);
}

export function rejectEventFunctionFields(options: Record<PropertyKey, unknown>): void {
  for (const field of ["input", "output", "tool", "trigger"] as const) {
    if (Object.hasOwn(options, field))
      throw new TypeError(`Event functions cannot declare ${field}`);
  }
}

function positive(value: unknown, name: string): void {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

function nonNegative(value: unknown, name: string): void {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
