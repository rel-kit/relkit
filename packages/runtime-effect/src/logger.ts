import { Context, Layer, Logger as EffectLogger, Option, References } from "effect";
import type { JsonValue } from "@relkit/contracts";
import {
  createObservabilityCollector,
  OBSERVABILITY_MODEL_VERSION,
  type RedactedObservabilityRecord,
  type LogRecord as ModelLogRecord,
  type ObservabilityCollector,
} from "@relkit/observability";
import { redactCause, redactFailureDetail } from "./failure-redaction.js";
import { formatHumanLog, formatMessage } from "./logger-format.js";
import { InvocationTrace } from "./tracing.js";
import { currentExecutionContext } from "@relkit/invocation";
export { formatHumanLog } from "./logger-format.js";
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
export type MinimumLogLevel = LogLevel | "all" | "none";
type EffectLogLevel = "All" | "Fatal" | "Error" | "Warn" | "Info" | "Debug" | "Trace" | "None";
export type LogRecord = ModelLogRecord;
export type RedactedLogRecord = RedactedObservabilityRecord & LogRecord;
export type LogCollector = Pick<ObservabilityCollector, "collect">;
export interface HumanLogSink {
  readonly write: (line: string, record: RedactedLogRecord) => void;
}
export interface JsonLogSink {
  readonly write: (record: RedactedLogRecord) => void;
}
export type RedactLogRecord = (record: LogRecord) => LogRecord;
export interface LoggerOptions {
  readonly component?: string;
  readonly minimumLevel?: MinimumLogLevel;
  readonly human?: HumanLogSink | false;
  readonly json?: JsonLogSink | false;
  readonly collector?: LogCollector;
  readonly redact?: RedactLogRecord;
}
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
export function isLogLevelEnabled(level: LogLevel, minimum: MinimumLogLevel): boolean {
  if (minimum === "none") return false;
  if (minimum === "all") return true;
  return levelOrder[level] >= levelOrder[minimum];
}
export const consoleHumanSink: HumanLogSink = Object.freeze({
  write: (line: string) => console.log(line),
});
export const stdoutJsonSink: JsonLogSink = Object.freeze({
  write: (record: LogRecord) => process.stdout.write(`${JSON.stringify(record)}\n`),
});
export function createEffectLogger(
  options: LoggerOptions = {},
): EffectLogger.Logger<unknown, void> {
  const minimum = options.minimumLevel ?? "info";
  const human = options.human === false ? undefined : (options.human ?? consoleHumanSink);
  const json = options.json === false ? undefined : options.json;
  const redact = options.redact ?? ((record: LogRecord) => record);
  const collector = options.collector ?? createObservabilityCollector();
  return EffectLogger.make((event) => {
    const level = effectLevel(event.logLevel);
    if (level === undefined || !isLogLevelEnabled(level, minimum)) return;
    const record = admitRecord(
      makeRecord(event, options.component ?? "runtime"),
      redact,
      collector,
    );
    if (record === undefined) return;
    if (human !== undefined) human.write(formatHumanLog(record), record);
    if (json !== undefined) json.write(record);
  });
}
export function createLoggerLayer(options: LoggerOptions = {}): Layer.Layer<never, never, never> {
  return Layer.mergeAll(
    EffectLogger.layer([createEffectLogger(options)]),
    Layer.succeed(References.MinimumLogLevel, effectMinimum(options.minimumLevel ?? "info")),
  );
}
function makeRecord(event: EffectLogger.Options<unknown>, component: string): LogRecord {
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
function admitRecord(record: LogRecord, redact: RedactLogRecord, collector: LogCollector) {
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
function onlyLog(value: ReturnType<LogCollector["collect"]>): RedactedLogRecord | undefined {
  return value?.signal === "log" ? (value as RedactedLogRecord) : undefined;
}
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
function effectLevel(level: EffectLogLevel): LogLevel | undefined {
  return level === "All" || level === "None" ? undefined : (level.toLowerCase() as LogLevel);
}
function effectMinimum(level: MinimumLogLevel): EffectLogLevel {
  if (level === "all") return "Trace";
  if (level === "none") return "None";
  return `${level[0]!.toUpperCase()}${level.slice(1)}` as EffectLogLevel;
}
function jsonObject(value: unknown): Readonly<Record<string, JsonValue>> {
  const safe = redactFailureDetail(value);
  return safe !== null && typeof safe === "object" && !Array.isArray(safe)
    ? Object.freeze(safe as Record<string, JsonValue>)
    : Object.freeze({});
}
const text = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
const optional = (key: string, value: unknown): Record<string, string> =>
  text(value) === undefined ? {} : { [key]: text(value)! };
const isLogLevel = (value: unknown): value is LogLevel =>
  typeof value === "string" && value in levelOrder;
