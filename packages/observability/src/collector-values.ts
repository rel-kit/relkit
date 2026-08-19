import { OBSERVABILITY_MODEL_VERSION } from "./model.js";

export type RecordLike = Record<string, unknown>;

export const INVOCATION_OUTCOMES = new Set([
  "success",
  "validation-error",
  "declared-error",
  "provider-failure",
  "cancelled",
  "timeout",
  "defect",
]);

export function isModelRecord(value: RecordLike): boolean {
  return (
    value.version === OBSERVABILITY_MODEL_VERSION &&
    typeof value.signal === "string" &&
    [
      "request",
      "invocation",
      "job",
      "event",
      "resource",
      "tool",
      "agent",
      "log",
      "span",
      "trace",
      "diagnostic",
      "generation",
    ].includes(value.signal)
  );
}

export function isInvocation(value: RecordLike): boolean {
  return (
    text(value.id) !== undefined &&
    text(value.functionId) !== undefined &&
    text(value.traceId) !== undefined &&
    text(value.startedAt) !== undefined &&
    text(value.source) !== undefined
  );
}

export function isAgentSpan(value: RecordLike): boolean {
  return text(value.agentId) !== undefined && text(value.spanId) !== undefined;
}

export function isRuntimeLog(value: RecordLike): boolean {
  return (
    text(value.timestamp) !== undefined &&
    text(value.component) !== undefined &&
    text(value.message) !== undefined
  );
}

export function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function isRecord(value: unknown): value is RecordLike {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
