import { canonicalJson, type JsonValue } from "@relkit/contracts";

/** Encodes tuple members with their primitive type so 1 and "1" never collide. */
export function stableIdentityTuple(values: readonly unknown[]): string {
  return canonicalJson(values.map(identityValue));
}

export function taskOperationIdentity(acceptanceIdentity: string, operation: string): string {
  return stableIdentityTuple(["relkit.task.operation", acceptanceIdentity, operation]);
}

export function retryOperationIdentity(runId: string, operationId: string): string {
  return stableIdentityTuple(["relkit.task.retry", runId, operationId, "retry"]);
}

export function scheduleOccurrenceIdentity(scheduleId: string, scheduledFor: string): string {
  return stableIdentityTuple(["relkit.job.schedule", scheduleId, scheduledFor]);
}

function identityValue(value: unknown): JsonValue {
  if (value === undefined) return { type: "undefined" };
  if (value === null) return { type: "null", value: null };
  if (typeof value === "number") {
    return { type: Object.is(value, -0) ? "negative-zero" : "number", value };
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return { type: typeof value, value };
  }
  if (Array.isArray(value)) {
    return { type: "array", value: value.map(identityValue) };
  }
  if (typeof value === "object") return { type: "object", value: value as JsonValue };
  return { type: typeof value };
}
