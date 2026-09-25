import { Effect } from "effect";
import { currentExecutionContextEffect } from "./dispatcher-scope.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type {
  InvocationRecord,
  LocalEffectLogger,
  PublicClock,
  StructuredLogRecord,
} from "./local-logger.types.js";

/** Creates a structured logger whose writes can use an injected invocation scope.
 * @param record - Started invocation record.
 * @param time - Public clock for log timestamps.
 * @returns A logger with Effect write and read operations; no expected creation failure.
 * @example Effect.runSync(createLocalStructuredLoggerEffect(record, time));
 */
export function createLocalStructuredLoggerEffect(
  record: InvocationRecord,
  time: PublicClock,
): Effect.Effect<LocalEffectLogger> {
  return observeInvocation(
    "logger.create",
    Effect.sync(() => {
      const entries: StructuredLogRecord[] = [];
      const writeEffect: LocalEffectLogger["writeEffect"] = (level, message, fields) =>
        observeInvocation(
          "logger.write",
          Effect.flatMap(currentExecutionContextEffect(), (active) =>
            Effect.sync(() => {
              entries.push(
                Object.freeze({
                  level,
                  message,
                  fields: Object.freeze({ ...(fields ?? {}) }),
                  timestamp: time.now().toISOString(),
                  invocationId: active?.invocationId ?? record.id,
                  traceId: active?.span.traceId ?? record.traceId,
                  ...(active?.span.spanId === undefined ? {} : { spanId: active.span.spanId }),
                  ...(active?.requestId === undefined ? {} : { requestId: active.requestId }),
                  ...(active?.originRequestId === undefined
                    ? {}
                    : { originRequestId: active.originRequestId }),
                  ...(active?.correlationId === undefined
                    ? {}
                    : { correlationId: active.correlationId }),
                  functionId: record.functionId,
                  source: record.source,
                  ...(record.serviceId === undefined ? {} : { serviceId: record.serviceId }),
                }),
              );
            }),
          ),
        );
      const write = (
        level: StructuredLogRecord["level"],
        message: string,
        fields?: Readonly<Record<string, unknown>>,
      ): void => {
        runInvocationSync(writeEffect(level, message, fields));
      };
      const recordsEffect = (): Effect.Effect<readonly StructuredLogRecord[]> =>
        observeInvocation(
          "logger.records",
          Effect.sync(() => Object.freeze([...entries])),
        );
      return Object.freeze({
        trace: (message: string, fields?: Readonly<Record<string, unknown>>) =>
          write("trace", message, fields),
        debug: (message: string, fields?: Readonly<Record<string, unknown>>) =>
          write("debug", message, fields),
        info: (message: string, fields?: Readonly<Record<string, unknown>>) =>
          write("info", message, fields),
        warn: (message: string, fields?: Readonly<Record<string, unknown>>) =>
          write("warn", message, fields),
        error: (message: string, fields?: Readonly<Record<string, unknown>>) =>
          write("error", message, fields),
        get records(): readonly StructuredLogRecord[] {
          return runInvocationSync(recordsEffect());
        },
        writeEffect,
        recordsEffect,
      });
    }),
  );
}

/** Synchronous structured logger factory adapter.
 * @param record - Started invocation record.
 * @param time - Public clock for timestamps.
 * @returns A logger with immutable record snapshots.
 * @example createLocalStructuredLogger(record, time);
 */
export function createLocalStructuredLogger(
  record: InvocationRecord,
  time: PublicClock,
): LocalEffectLogger {
  return runInvocationSync(createLocalStructuredLoggerEffect(record, time));
}
