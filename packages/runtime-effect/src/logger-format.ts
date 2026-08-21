import type { LogRecord } from "@zsys/observability";
import { redactFailureDetail } from "./failure-redaction.js";

export function formatHumanLog(record: LogRecord): string {
  const annotations = [
    ["request", record.requestId],
    ["invocation", record.invocationId],
    ["trace", record.traceId],
    ["span", record.spanId],
    ["correlation", record.correlationId],
    ["generation", record.generationId],
    ["graph", record.graphHash],
    ["source", record.source],
    ["function", record.functionId],
    ["service", record.serviceId],
  ]
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${value}`);
  const fields = Object.entries(record.fields).map(
    ([key, value]) => `${key}=${formatValue(value)}`,
  );
  return [
    record.timestamp,
    record.level.toUpperCase(),
    record.component,
    record.message,
    ...annotations,
    ...fields,
  ].join(" ");
}

export const formatMessage = (message: unknown): string =>
  (Array.isArray(message) ? message : [message]).map(formatValue).join(" ");

function formatValue(value: unknown): string {
  const safe = redactFailureDetail(value);
  return typeof safe === "string" ? safe : (JSON.stringify(safe) ?? "[unavailable]");
}
