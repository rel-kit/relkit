import { Effect } from "effect";
import type { ObservabilityRecord, ObservabilitySignal } from "../model.js";
import {
  dayForEffect,
  isRecordForSignalEffect,
  positiveSegmentBoundEffect,
  type SegmentUtilityError,
} from "./segment-store-utils-effect.js";
export type { SegmentState } from "./segment-store-utils.types.js";
export {
  SegmentUtilityError,
  dayForEffect,
  isRecordForSignalEffect,
  positiveSegmentBoundEffect,
} from "./segment-store-utils-effect.js";
function legacy(error: SegmentUtilityError): TypeError {
  return new TypeError(error.message);
}
/**
 * Validates a positive segment size bound.
 * @param value - Requested bound.
 * @returns The valid bound.
 * @throws {TypeError} If the bound is not a positive safe integer.
 * @example
 * const size = positive(1024);
 */
export function positive(value: number): number {
  return Effect.runSync(positiveSegmentBoundEffect(value).pipe(Effect.mapError(legacy)));
}
/**
 * Checks that a candidate record carries the expected signal and model version.
 * @param value - Candidate record.
 * @param signal - Expected signal.
 * @returns True if the value has the required discriminator fields.
 * @example
 * if (isRecordForSignal(value, "log")) console.log(value.signal);
 */
export function isRecordForSignal(
  value: unknown,
  signal: ObservabilitySignal,
): value is ObservabilityRecord {
  return Effect.runSync(isRecordForSignalEffect(value, signal));
}
/**
 * Converts a model timestamp to its UTC calendar day.
 * @param record - Record with a timestamp or signal-specific time field.
 * @returns An ISO calendar date.
 * @throws {TypeError} If the timestamp is absent or invalid.
 * @example
 * const day = dayFor(record);
 */
export function dayFor(record: ObservabilityRecord): string {
  return Effect.runSync(dayForEffect(record).pipe(Effect.mapError(legacy)));
}
