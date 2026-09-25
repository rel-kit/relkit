import { Effect } from "effect";
import type { InvocationRecord, LogRecord, SpanRecord } from "./model.js";
import type { RecordLike } from "./collector-values.types.js";
import {
  invocationRecordEffect,
  logRecordEffect,
  spanRecordEffect,
} from "./collector-records-effect.js";
export {
  invocationRecordEffect,
  logRecordEffect,
  spanRecordEffect,
} from "./collector-records-effect.js";
/**
 * Converts legacy invocation fields into a model record.
 * @param value - Candidate invocation fields.
 * @returns A versioned invocation record or undefined.
 * @example
 * const record = invocationRecord(value);
 */
export function invocationRecord(value: RecordLike): InvocationRecord | undefined {
  return Effect.runSync(invocationRecordEffect(value));
}
/**
 * Converts span lifecycle fields into a model record.
 * @param value - Candidate span fields.
 * @returns A versioned span record or undefined.
 * @example
 * const record = spanRecord(value);
 */
export function spanRecord(value: RecordLike): SpanRecord | undefined {
  return Effect.runSync(spanRecordEffect(value));
}
/**
 * Converts runtime log fields into a model record.
 * @param value - Candidate log fields.
 * @returns A versioned log record or undefined.
 * @example
 * const record = logRecord(value);
 */
export function logRecord(value: RecordLike): LogRecord | undefined {
  return Effect.runSync(logRecordEffect(value));
}
