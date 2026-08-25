import { isStableId } from "@zsys/contracts";
import { normalizeErrorRetry } from "@zsys/invocation";
import type { StandardSchemaV1 } from "@zsys/schema";
import type { ErrorDescriptorAny, ErrorHttpMapping } from "./define-error.js";

export function isErrorDescriptor(value: unknown): value is ErrorDescriptorAny {
  if (!isRecord(value)) return false;
  const ref = value.ref;
  try {
    normalizeErrorRetry(value.retry, value.afterMs);
  } catch {
    return false;
  }
  return (
    value.kind === "error" &&
    isStableId(value.id) &&
    isRecord(ref) &&
    ref.kind === "error" &&
    ref.id === value.id &&
    Reflect.ownKeys(ref).length === 2 &&
    typeof value.create === "function"
  );
}

export function validateErrorHttp(http: ErrorHttpMapping | undefined): void {
  if (
    http !== undefined &&
    (!Number.isInteger(http.status) || http.status < 100 || http.status > 599)
  ) {
    throw new TypeError("Error HTTP status must be an integer from 100 through 599");
  }
}

export function assertErrorSchema(value: unknown): asserts value is StandardSchemaV1 {
  if (!isRecord(value))
    throw new TypeError("Declared error data must be a Standard Schema v1 validator");
  const standard = value["~standard"];
  if (!isRecord(standard) || standard.version !== 1 || typeof standard.validate !== "function") {
    throw new TypeError("Declared error data must be a Standard Schema v1 validator");
  }
}

export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    !Array.isArray(value)
  );
}
