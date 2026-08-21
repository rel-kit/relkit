export type ErrorRetry = "never" | "later";

export interface ErrorRetryLater {
  readonly kind: "later";
  readonly afterMs?: number;
}

export type ErrorRetryInput = ErrorRetry | ErrorRetryLater;

export interface NormalizedErrorRetry {
  readonly retry: ErrorRetry;
  readonly afterMs?: number;
}

export function normalizeErrorRetry(value: unknown, afterMs?: unknown): NormalizedErrorRetry {
  if (value === undefined || value === "never") {
    if (afterMs !== undefined) throw invalidRetry();
    return Object.freeze({ retry: "never" });
  }
  if (value === "later") return later(afterMs);
  if (!isRecord(value) || value.kind !== "later") throw invalidRetry();
  const nestedAfterMs = value.afterMs;
  if (afterMs !== undefined && nestedAfterMs !== undefined && afterMs !== nestedAfterMs) {
    throw invalidRetry();
  }
  return later(nestedAfterMs === undefined ? afterMs : nestedAfterMs);
}

function later(afterMs: unknown): NormalizedErrorRetry {
  if (afterMs === undefined) return Object.freeze({ retry: "later" });
  if (typeof afterMs !== "number" || !Number.isSafeInteger(afterMs) || afterMs < 0)
    throw invalidAfterMs();
  return Object.freeze({ retry: "later", afterMs });
}

function invalidRetry(): TypeError {
  return new TypeError('Declared error retry must be "never", "later", or { kind: "later" }.');
}

function invalidAfterMs(): TypeError {
  return new TypeError("Declared error retry.afterMs must be a finite non-negative integer.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
