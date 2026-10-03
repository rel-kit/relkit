import type {
  LogLevel,
  MinimumLogLevel,
  EffectLogLevel,
  LogRecord,
  RedactedLogRecord,
  LogCollector,
  RedactLogRecord,
} from "./logger.types.js";
import { Context, Logger as EffectLogger, Option, References } from "effect";
import type { JsonValue } from "@relkit/contracts";
import { OBSERVABILITY_MODEL_VERSION } from "@relkit/observability";
import { redactCause, redactFailureDetail } from "./failure-redaction.js";
import { formatMessage } from "./logger-format.js";
import { InvocationTrace } from "./tracing.js";
import { currentExecutionContext } from "@relkit/invocation";

const levelOrder: Record<LogLevel, number> = {
  trace: 0,
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const reservedAnnotations = new Set([
  "component",
  "functionId",
  "serviceId",
  "requestId",
  "originRequestId",
  "invocationId",
  "traceId",
  "spanId",
  "correlationId",
  "generationId",
  "graphHash",
  "source",
]);

/**
 * Compares a concrete level with a configured threshold.
 * @param level - Record severity.
 * @param minimum - Configured threshold.
 * @returns Whether the record should be admitted.
 */
export function isLogLevelEnabled(level: LogLevel, minimum: MinimumLogLevel): boolean {
  if (minimum === "none") return false;
  if (minimum === "all") return true;
  return levelOrder[level] >= levelOrder[minimum];
}

/**
 * Projects the current invocation and log annotations into a safe record.
 * @param event - Effect log event with fiber context.
 * @param component - Fallback runtime component.
 * @returns A versioned log record with bounded, redacted fields.
 */
export function makeRecord(event: EffectLogger.Options<unknown>, component: string): LogRecord {
  const annotations = event.fiber.getRef(References.CurrentLogAnnotations);
  const trace = Option.getOrUndefined(Context.getOption(event.fiber.context, InvocationTrace));
  const active = currentExecutionContext();
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(annotations))
    if (!reservedAnnotations.has(key)) fields[key] = value;
  if (event.cause.reasons.length > 0) fields.cause = redactCause(event.cause);
  return safeRecord({
    version: OBSERVABILITY_MODEL_VERSION,
    signal: "log",
    timestamp: event.date.toISOString(),
    level: effectLevel(event.logLevel) ?? "info",
    component: text(annotations.component) ?? component,
    message: formatMessage(event.message),
    fields: jsonObject(fields),
    ...optional("functionId", trace?.functionId ?? annotations.functionId),
    ...optional("requestId", active?.requestId ?? annotations.requestId),
    ...optional("originRequestId", active?.originRequestId ?? annotations.originRequestId),
    ...optional(
      "invocationId",
      active?.invocationId ?? trace?.invocationId ?? annotations.invocationId,
    ),
    ...optional("traceId", active?.span.traceId ?? trace?.traceId ?? annotations.traceId),
    ...optional("spanId", active?.span.spanId ?? trace?.spanId ?? annotations.spanId),
    ...optional(
      "correlationId",
      active?.correlationId ?? trace?.correlationId ?? annotations.correlationId,
    ),
    ...optional("generationId", active?.generationId ?? annotations.generationId),
    ...optional("graphHash", active?.graphHash ?? annotations.graphHash),
    ...optional("source", trace?.source ?? annotations.source),
    ...optional("serviceId", trace?.serviceId ?? annotations.serviceId),
  });
}

/**
 * Redacts and admits a record before any sink receives it.
 * @param record - Projected input record.
 * @param redact - Application redaction policy.
 * @param collector - Versioned record admission boundary.
 * @returns The admitted log, or undefined when both admission attempts fail.
 */
export function admitRecord(
  record: LogRecord,
  redact: RedactLogRecord,
  collector: LogCollector,
): RedactedLogRecord | undefined {
  try {
    return onlyLog(collector.collect(safeRecord(redact(record))));
  } catch {
    try {
      return onlyLog(
        collector.collect(safeRecord({ ...record, message: "Log redaction failed", fields: {} })),
      );
    } catch {
      return undefined;
    }
  }
}

/**
 * Narrows collector output to the log signal.
 * @param value - Admitted observability record.
 * @returns A redacted log record when its signal is log.
 */
function onlyLog(value: ReturnType<LogCollector["collect"]>): RedactedLogRecord | undefined {
  return value?.signal === "log" ? (value as RedactedLogRecord) : undefined;
}

/**
 * Rebuilds the log envelope from its allowed fields.
 * @param record - Potentially modified record from a custom redactor.
 * @returns An immutable log record with JSON-safe details.
 */
function safeRecord(record: LogRecord): LogRecord {
  return Object.freeze({
    version: OBSERVABILITY_MODEL_VERSION,
    signal: "log",
    timestamp: text(record.timestamp) ?? "",
    level: isLogLevel(record.level) ? record.level : "info",
    component: text(record.component) ?? "runtime",
    message: text(record.message) ?? "[unavailable]",
    fields: jsonObject(record.fields),
    ...optional("functionId", record.functionId),
    ...optional("requestId", record.requestId),
    ...optional("originRequestId", record.originRequestId),
    ...optional("invocationId", record.invocationId),
    ...optional("traceId", record.traceId),
    ...optional("spanId", record.spanId),
    ...optional("correlationId", record.correlationId),
    ...optional("generationId", record.generationId),
    ...optional("graphHash", record.graphHash),
    ...optional("source", record.source),
    ...optional("serviceId", record.serviceId),
  });
}

/**
 * Maps Effect severity to the public log vocabulary.
 * @param level - Effect severity reference.
 * @returns A concrete log level, excluding the All and None controls.
 */
export function effectLevel(level: EffectLogLevel): LogLevel | undefined {
  return level === "All" || level === "None" ? undefined : (level.toLowerCase() as LogLevel);
}

/**
 * Maps the public threshold to Effect's log-level reference.
 * @param level - Configured public threshold.
 * @returns The corresponding Effect threshold.
 */
export function effectMinimum(level: MinimumLogLevel): EffectLogLevel {
  if (level === "all") return "Trace";
  if (level === "none") return "None";
  return `${level[0]!.toUpperCase()}${level.slice(1)}` as EffectLogLevel;
}

/**
 * Converts annotation fields to bounded JSON without invoking getters.
 * @param value - Untrusted detail to project.
 * @returns A frozen JSON object, or an empty object for scalar detail.
 */
function jsonObject(value: unknown): Readonly<Record<string, JsonValue>> {
  const safe = redactFailureDetail(value);
  return safe !== null && typeof safe === "object" && !Array.isArray(safe)
    ? Object.freeze(safe as Record<string, JsonValue>)
    : Object.freeze({});
}

/**
 * Narrows a field without coercing user objects.
 * @param value - Candidate field value.
 * @returns The string value when present.
 */
const text = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * Projects one optional string field.
 * @param key - Envelope field name.
 * @param value - Candidate field value.
 * @returns A record containing the field only when it is a string.
 */
const optional = (key: string, value: unknown): Record<string, string> =>
  text(value) === undefined ? {} : { [key]: text(value)! };

/**
 * Checks the public severity vocabulary.
 * @param value - Candidate severity.
 * @returns Whether the value is a recognized concrete level.
 */
const isLogLevel = (value: unknown): value is LogLevel =>
  typeof value === "string" && value in levelOrder;
