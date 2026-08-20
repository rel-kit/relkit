import { normalizeId } from "@zsys/contracts";
import type { RetryPolicy } from "@zsys/jobs";
import type { EventDelivery } from "./listener-types.js";

export function delivery(value: unknown): EventDelivery {
  if (value === undefined) return "durable";
  if (value !== "ephemeral" && value !== "durable")
    throw new TypeError("Event delivery must be ephemeral or durable");
  return value;
}

export function optionalId(value: unknown): string | undefined {
  return value === undefined ? undefined : normalizeId(String(value));
}

export function positive(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new TypeError(`${name} must be a positive integer`);
  return value as number;
}

export function retryPolicy(value: unknown): RetryPolicy | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Event retry policy must be an object");
  const maxAttempts = positive(value.maxAttempts, "retry.maxAttempts")!;
  const initialDelayMs = nonNegative(value.initialDelayMs, "retry.initialDelayMs");
  const maxDelayMs = nonNegative(value.maxDelayMs, "retry.maxDelayMs");
  if (maxDelayMs < initialDelayMs)
    throw new TypeError("retry.maxDelayMs must be at least retry.initialDelayMs");
  if (
    typeof value.multiplier !== "number" ||
    !Number.isFinite(value.multiplier) ||
    value.multiplier < 1
  )
    throw new TypeError("retry.multiplier must be a finite number at least 1");
  if (value.jitter !== "none" && value.jitter !== "full" && value.jitter !== "equal")
    throw new TypeError("retry.jitter must be none, full, or equal");
  return Object.freeze({
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    multiplier: value.multiplier,
    jitter: value.jitter,
  });
}

function nonNegative(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`${name} must be a non-negative integer`);
  return value as number;
}

export function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
