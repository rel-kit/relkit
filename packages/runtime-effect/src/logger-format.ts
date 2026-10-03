import type { LogRecord } from "@relkit/observability";
import { redactFailureDetail } from "./failure-redaction.js";

/**
 * Formats an admitted log with aligned correlation details.
 * @param record - Admitted versioned log record.
 * @returns Human-readable output for the configured sink.
 */
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

/**
 * Formats messages after bounded secret redaction.
 * @param message - One value or a collection of message values.
 * @returns A space-separated safe message.
 */
export const formatMessage = (message: unknown): string =>
  (Array.isArray(message) ? message : [message]).map(formatValue).join(" ");

/**
 * Formats one redacted value without exposing raw error detail.
 * @param value - Message or structured field value.
 * @returns Safe text or JSON.
 */
function formatValue(value: unknown): string {
  const safe = redactFailureDetail(value);
  return typeof safe === "string" ? safe : (JSON.stringify(safe) ?? "[unavailable]");
}

/**
 * Extracts clock time from a canonical timestamp.
 * @param timestamp - Record timestamp.
 * @returns The time portion, or the original value when its format differs.
 */
function formatTimestamp(timestamp: string): string {
  return /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})/.exec(timestamp)?.[1] ?? timestamp;
}
