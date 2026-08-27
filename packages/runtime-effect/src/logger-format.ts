import type { LogRecord } from "@relkit/observability";
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
  const details = [...annotations, ...fields];
  const prefix = `${formatTimestamp(record.timestamp)} ${record.level.toUpperCase().padEnd(5)} `;
  const headline = `${prefix}${record.component} ${record.message}`;
  return details.length === 0
    ? headline
    : `${headline}\n${" ".repeat(prefix.length)}${details.join(" ")}`;
}

export const formatMessage = (message: unknown): string =>
  (Array.isArray(message) ? message : [message]).map(formatValue).join(" ");

function formatValue(value: unknown): string {
  const safe = redactFailureDetail(value);
  return typeof safe === "string" ? safe : (JSON.stringify(safe) ?? "[unavailable]");
}

function formatTimestamp(timestamp: string): string {
  return /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})/.exec(timestamp)?.[1] ?? timestamp;
}
