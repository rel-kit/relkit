import type {
  RedactedObservabilityRecord,
  LogRecord as ModelLogRecord,
  ObservabilityCollector,
} from "@relkit/observability";

/** Concrete public log severities in ascending order. */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/** Configured threshold, including all and none controls. */
export type MinimumLogLevel = LogLevel | "all" | "none";

/** Effect severity vocabulary used at the logging adapter boundary. */
export type EffectLogLevel =
  "All" | "Fatal" | "Error" | "Warn" | "Info" | "Debug" | "Trace" | "None";

/** Existing versioned observability log envelope. */
export type LogRecord = ModelLogRecord;

/** Admitted log record branded by the observability collector. */
export type RedactedLogRecord = RedactedObservabilityRecord & LogRecord;

/** Record admission dependency; tests may substitute its collection policy. */
export type LogCollector = Pick<ObservabilityCollector, "collect">;

/** Human output boundary receiving admitted records and formatted text. */
export interface HumanLogSink {
  /** Writes one already admitted and redacted human log.
   * @param line - Formatted log text.
   * @param record - Structured envelope for the same log event.
   * @returns Nothing; thrown sink failures are isolated by the logger.
   */
  readonly write: (line: string, record: RedactedLogRecord) => void;
}

/** Structured output boundary receiving only admitted records. */
export interface JsonLogSink {
  /** Writes one already admitted and redacted structured log.
   * @param record - Versioned observability log envelope.
   * @returns Nothing; thrown sink failures are isolated by the logger.
   */
  readonly write: (record: RedactedLogRecord) => void;
}

/** Application redaction policy applied before record admission and sinks.
 * @param record - Bounded log envelope containing projected, secret-masked fields.
 * @returns The envelope after application-specific redaction.
 */
export type RedactLogRecord = (record: LogRecord) => LogRecord;

/** Generation logger configuration; children may override their active threshold. */
export interface LoggerOptions {
  readonly component?: string;
  readonly minimumLevel?: MinimumLogLevel;
  readonly human?: HumanLogSink | false;
  readonly json?: JsonLogSink | false;
  readonly collector?: LogCollector;
  readonly redact?: RedactLogRecord;
}
