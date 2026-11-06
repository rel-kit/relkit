import { Effect } from "effect";
import type { ObservabilityRecord } from "./model.js";
import { toObservabilityRecordEffect } from "./collector-events-effect.js";
export { toObservabilityRecordEffect } from "./collector-events-effect.js";
/**
 * Converts a supported runtime event into an observability record.
 * @param value - Candidate runtime event.
 * @returns A model record or undefined for an unsupported event.
 * @example
 * const record = toObservabilityRecord(event);
 */
export function toObservabilityRecord(value: unknown): ObservabilityRecord | undefined {
  return Effect.runSync(toObservabilityRecordEffect(value));
}
