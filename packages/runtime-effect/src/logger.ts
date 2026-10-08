import { Context, Layer, Logger as EffectLogger, References } from "effect";
import { createObservabilityCollector } from "@relkit/observability";
import type {
  LoggerOptions,
  LogRecord,
  HumanLogSink,
  JsonLogSink,
  RedactedLogRecord,
} from "./logger.types.js";
import {
  makeRecord,
  admitRecord,
  effectLevel,
  effectMinimum,
  isLogLevelEnabled,
} from "./logger-record.js";
import { formatHumanLog } from "./logger-format.js";
export { formatHumanLog } from "./logger-format.js";
export { isLogLevelEnabled } from "./logger-record.js";
export type {
  LogLevel,
  MinimumLogLevel,
  LogRecord,
  RedactedLogRecord,
  LogCollector,
  HumanLogSink,
  JsonLogSink,
  RedactLogRecord,
  LoggerOptions,
} from "./logger.types.js";

/** Default human sink; redaction and admission precede writes. */
export const consoleHumanSink: HumanLogSink = Object.freeze({
  write: (line: string) => console.log(line),
});

/** Optional structured stdout sink for admitted versioned log records. */
export const stdoutJsonSink: JsonLogSink = Object.freeze({
  write: (record: LogRecord) => process.stdout.write(`${JSON.stringify(record)}\n`),
});

/**
 * Builds one redacting logger using the caller's sinks.
 * @param options - Sink, redaction and component configuration.
 * @returns The Effect logger; each event reads the active fiber's minimum level.
 * @see createLoggerLayer for the configured runtime provisioning example.
 */
export function createEffectLogger(
  options: LoggerOptions = {},
): EffectLogger.Logger<unknown, void> {
  const human = options.human === false ? undefined : (options.human ?? consoleHumanSink);
  const json = options.json === false ? undefined : options.json;
  const redact = options.redact ?? ((record: LogRecord) => record);
  const collector = options.collector ?? createObservabilityCollector();
  return EffectLogger.make((event) => {
    const level = effectLevel(event.logLevel);
    const configured =
      Context.getOrUndefined(event.fiber.context, References.MinimumLogLevel) ??
      effectMinimum(options.minimumLevel ?? "info");
    const minimum =
      configured === "All" ? "all" : configured === "None" ? "none" : effectLevel(configured);
    if (level === undefined || minimum === undefined || !isLogLevelEnabled(level, minimum)) return;
    const record = admitRecord(
      makeRecord(event, options.component ?? "runtime"),
      redact,
      collector,
    );
    if (record === undefined) return;
    const operation =
      typeof record.fields.domain === "string" &&
      typeof record.fields.operation === "string" &&
      /^Execution operation (?:completed|failed|interrupted)$/.test(record.message);
    const diagnostics = minimum === "all" || minimum === "trace" || minimum === "debug";
    deliverLog(record, operation && !diagnostics ? undefined : human, json);
  });
}

/**
 * Delivers an admitted record independently to each configured sink.
 * @param record - Already redacted log record.
 * @param human - Optional human sink.
 * @param json - Optional structured sink.
 * @returns Nothing; sink failures remain observational.
 */
function deliverLog(
  record: RedactedLogRecord,
  human: HumanLogSink | undefined,
  json: JsonLogSink | undefined,
): void {
  try {
    human?.write(formatHumanLog(record), record);
  } catch {
    /* Sink failure cannot fail execution. */
  }
  try {
    json?.write(record);
  } catch {
    /* Sibling sinks remain independent. */
  }
}

/**
 * Provides the configured sinks and fiber-local default minimum level.
 * @param options - Logger configuration shared by the owning runtime.
 * @returns A Layer that children inherit and can override locally.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { createLoggerLayer } from "@relkit/runtime-effect";
 * const started = Effect.logInfo("Generation started").pipe(
 *   Effect.provide(createLoggerLayer({ minimumLevel: "info" })));
 * await Effect.runPromise(started);
 * ```
 */
export function createLoggerLayer(options: LoggerOptions = {}): Layer.Layer<never, never, never> {
  // Quiet native facades have no consumer; retain the threshold without projecting
  // records into an inaccessible collector. Explicit collectors/redactors still run.
  const silent =
    options.human === false &&
    options.json === false &&
    options.collector === undefined &&
    options.redact === undefined;
  return Layer.mergeAll(
    EffectLogger.layer(silent ? [] : [createEffectLogger(options)]),
    Layer.succeed(References.MinimumLogLevel, effectMinimum(options.minimumLevel ?? "info")),
  );
}
