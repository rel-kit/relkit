import { OBSERVABILITY_MODEL_VERSION, type ObservabilityRecord } from "../model.js";
import { Effect, Schema } from "effect";
import type { LocalRecord } from "./types.types.js";

export type * from "./types.types.js";

/**
 * Invalid local record envelope at the persistent storage boundary.
 *
 * @example
 * Effect.runSync(validateLocalRecordEffect(null).pipe(
 *   Effect.catchTag("LocalRecordValidationError", (error) => Effect.succeed(error.reason)),
 * ));
 */
export class LocalRecordValidationError extends Schema.TaggedError<LocalRecordValidationError>()(
  "LocalRecordValidationError",
  {
    reason: Schema.Literals(["envelope", "key", "record", "timestamp", "log"]),
    message: Schema.String,
  },
) {}

const signals = new Set([
  "log",
  "request",
  "span",
  "trace",
  "invocation",
  "job",
  "event",
  "operation",
  "tool",
  "agent",
  "diagnostic",
  "generation",
]);

function invalid(
  reason: "envelope" | "key" | "record" | "timestamp" | "log",
  message: string,
): LocalRecordValidationError {
  return new LocalRecordValidationError({ reason, message });
}

/**
 * Validates a local transport envelope before persistence.
 *
 * @param value - Untrusted worker input.
 * @returns An Effect with the record or a tagged validation failure.
 * @example
 * Effect.runSync(validateLocalRecordEffect(envelope));
 */
export const validateLocalRecordEffect = Effect.fn("ObservabilityLocal.validateRecord")(function* (
  value: unknown,
) {
  if (value === null || typeof value !== "object")
    return yield* Effect.fail(invalid("envelope", "Invalid telemetry envelope"));
  const item = value as LocalRecord;
  if (
    typeof item.key !== "string" ||
    item.key.length === 0 ||
    item.key.length > 1024 ||
    !["application", "relkit", "inspector"].includes(item.origin)
  )
    return yield* Effect.fail(invalid("key", "Invalid telemetry identity"));
  const record = item.record;
  if (
    record === null ||
    typeof record !== "object" ||
    record.version !== OBSERVABILITY_MODEL_VERSION ||
    !signals.has(record.signal)
  )
    return yield* Effect.fail(invalid("record", "Invalid telemetry record"));
  if (!Number.isFinite(yield* recordTimeEffect(record)))
    return yield* Effect.fail(invalid("timestamp", "Invalid telemetry timestamp"));
  if (
    record.signal === "log" &&
    (typeof record.message !== "string" ||
      typeof record.component !== "string" ||
      !["trace", "debug", "info", "warn", "error", "fatal"].includes(record.level))
  )
    return yield* Effect.fail(invalid("log", "Invalid log record"));
  return item;
});

/**
 * Reads the canonical time field for a local record.
 *
 * @param record - Observability record with one supported time field.
 * @returns An Effect with the parsed epoch milliseconds, possibly NaN.
 * @example
 * Effect.runSync(recordTimeEffect(logRecord));
 */
export const recordTimeEffect = Effect.fn("ObservabilityLocal.recordTime")(function* (
  record: ObservabilityRecord,
) {
  const value = record as unknown as Record<string, unknown>;
  return Date.parse(
    String(value.timestamp ?? value.startedAt ?? value.occurredAt ?? value.acceptedAt),
  );
});

/**
 * Synchronous compatibility adapter for local record validation.
 *
 * @param value - Untrusted worker input.
 * @returns Nothing after the input is narrowed to LocalRecord.
 * @throws {TypeError} If the envelope or record is invalid.
 * @example
 * validateLocalRecord(envelope);
 */
export function validateLocalRecord(value: unknown): asserts value is LocalRecord {
  Effect.runSync(
    validateLocalRecordEffect(value).pipe(
      Effect.catchTag("LocalRecordValidationError", (error) =>
        Effect.sync(() => {
          throw new TypeError(error.message);
        }),
      ),
    ),
  );
}

/**
 * Synchronous compatibility adapter for local record time parsing.
 *
 * @param record - Observability record with one supported time field.
 * @returns Parsed epoch milliseconds, possibly NaN.
 * @example
 * recordTime(logRecord);
 */
export function recordTime(record: ObservabilityRecord): number {
  return Effect.runSync(recordTimeEffect(record));
}
