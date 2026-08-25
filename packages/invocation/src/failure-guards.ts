import { Cause } from "effect";
import { normalizeErrorRetry, type ErrorRetryInput } from "./error-retry.js";

export type DeclaredErrorLike = Error & {
  readonly id: string;
  readonly data: unknown;
  readonly retry?: ErrorRetryInput;
  readonly afterMs?: number;
  readonly http?: { readonly status: number };
  readonly ref: { readonly kind: unknown; readonly id: string };
};

export type FunctionFailureLike = {
  readonly _tag: "FunctionFailure";
  readonly error: unknown;
};

export function isFunctionFailure(value: unknown): value is FunctionFailureLike {
  return isRecord(value) && value._tag === "FunctionFailure" && "error" in value;
}

export function isDeclaredError(value: unknown): value is DeclaredErrorLike {
  if (!(value instanceof Error) || value.name !== "DeclaredError" || !isRecord(value)) return false;
  const ref = value.ref;
  return (
    typeof value.id === "string" &&
    typeof value.message === "string" &&
    isValidRetry(value.retry, value.afterMs) &&
    isRecord(ref) &&
    ref.kind === "error" &&
    ref.id === value.id
  );
}

function isValidRetry(value: unknown, afterMs: unknown): boolean {
  try {
    normalizeErrorRetry(value, afterMs);
    return true;
  } catch {
    return false;
  }
}

export function isProviderError(value: unknown): boolean {
  return isRecord(value) && (value._tag === "ProviderError" || value.name === "ProviderError");
}

export function isDependencyNotConfigured(value: unknown): value is {
  readonly name: "DependencyNotConfiguredError";
  readonly category: string;
  readonly dependencyName: string;
} {
  return (
    isRecord(value) &&
    value.name === "DependencyNotConfiguredError" &&
    typeof value.category === "string" &&
    typeof value.dependencyName === "string"
  );
}

export function isCancellation(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.name === "AbortError" ||
      value.name === "CanceledError" ||
      value.code === "ABORT_ERR" ||
      value.code === "ERR_ABORTED" ||
      value._tag === "Abort")
  );
}

export function isTimeout(value: unknown): boolean {
  return (
    Cause.isTimeoutError(value) ||
    (isRecord(value) &&
      (value.name === "TimeoutError" ||
        value._tag === "TimeoutError" ||
        value.code === "ETIMEDOUT"))
  );
}

export function requiredText(value: string, label: string): string {
  if (value.trim().length === 0) throw new TypeError(`${label} must be non-empty`);
  return value;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object";
}
