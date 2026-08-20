import { Cause } from "effect";

export type DeclaredErrorLike = Error & {
  readonly id: string;
  readonly data: unknown;
  readonly retry: "never" | "later";
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
    (value.retry === "never" || value.retry === "later") &&
    isRecord(ref) &&
    ref.kind === "error" &&
    ref.id === value.id
  );
}
export function isProviderError(value: unknown): boolean {
  return isRecord(value) && (value._tag === "ProviderError" || value.name === "ProviderError");
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
