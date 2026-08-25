import { OBSERVABILITY_MODEL_VERSION, type LogRecord, type ObservabilityRecord } from "./model.js";
import {
  isAgentSpan,
  isInvocation,
  isModelRecord,
  isRecord,
  isRuntimeLog,
  type RecordLike,
  text,
} from "./collector-values.js";
import { agentTurnRecord, invocationRecord, logRecord, spanRecord } from "./collector-records.js";

export function toObservabilityRecord(value: unknown): ObservabilityRecord | undefined {
  if (!isRecord(value)) return undefined;
  if (isModelRecord(value)) return value as unknown as ObservabilityRecord;
  const type = text(value.type);
  const record = isRecord(value.record)
    ? value.record
    : type === "invocation.completed" &&
        isRecord(value.completion) &&
        isRecord(value.completion.record)
      ? value.completion.record
      : undefined;
  if (type === "invocation.started" || type === "invocation.completed") {
    return record === undefined ? undefined : invocationRecord(record);
  }
  if (type === "span.started" || type === "span.completed") {
    return record === undefined ? undefined : spanRecord(record);
  }
  if (type?.startsWith("request.") === true) return requestLifecycleLog(value);
  if (record !== undefined && isAgentSpan(record)) return agentTurnRecord(record);
  if (isAgentSpan(value)) return agentTurnRecord(value);
  if (isInvocation(value)) return invocationRecord(value);
  if (isRuntimeLog(value)) return logRecord(value);
  return undefined;
}

function requestLifecycleLog(value: RecordLike): LogRecord | undefined {
  const requestId = text(value.requestId);
  const traceId = text(value.traceId);
  const serviceId = text(value.serviceId);
  const functionId = text(value.functionId);
  const type = text(value.type);
  const timestamp = text(value.completedAt) ?? text(value.startedAt);
  if (
    requestId === undefined ||
    traceId === undefined ||
    type === undefined ||
    timestamp === undefined
  )
    return undefined;
  const fields: Record<string, unknown> = {};
  for (const key of ["method", "path", "status", "durationMs", "errorName"])
    if (value[key] !== undefined) fields[key] = value[key];
  return {
    version: OBSERVABILITY_MODEL_VERSION,
    signal: "log",
    timestamp,
    level: type === "request.failed" ? "error" : type === "request.cancelled" ? "warn" : "info",
    component: "runtime.http",
    message: type,
    fields: fields as LogRecord["fields"],
    requestId,
    traceId,
    ...(serviceId === undefined ? {} : { serviceId }),
    ...(functionId === undefined ? {} : { functionId }),
    source: "http",
  };
}
