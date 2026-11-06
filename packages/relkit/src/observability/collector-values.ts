import { Effect } from "effect";
import type { RecordLike } from "./collector-values.types.js";
import {
  collectorTextEffect,
  isCollectorRecordEffect,
  isInvocationEffect,
  isModelRecordEffect,
  isRuntimeLogEffect,
} from "./collector-values-effect.js";
export type { RecordLike } from "./collector-values.types.js";
export { INVOCATION_OUTCOMES } from "./collector-values-core.js";
export {
  collectorTextEffect,
  isCollectorRecordEffect,
  isInvocationEffect,
  isModelRecordEffect,
  isRuntimeLogEffect,
} from "./collector-values-effect.js";
/**
 * Checks a supported model signal and version.
 * @param value - Candidate record.
 * @returns True when the model version and signal are supported.
 * @example
 * if (isModelRecord(value)) use(value);
 */
export function isModelRecord(value: RecordLike): boolean {
  return Effect.runSync(isModelRecordEffect(value));
}
/**
 * Checks invocation identity fields in a legacy event.
 * @param value - Candidate event.
 * @returns True when required fields are present.
 * @example
 * const valid = isInvocation(value);
 */
export function isInvocation(value: RecordLike): boolean {
  return Effect.runSync(isInvocationEffect(value));
}
/**
 * Checks runtime log fields in a legacy event.
 * @param value - Candidate event.
 * @returns True when required fields are present.
 * @example
 * const valid = isRuntimeLog(value);
 */
export function isRuntimeLog(value: RecordLike): boolean {
  return Effect.runSync(isRuntimeLogEffect(value));
}
/**
 * Returns nonempty text when present.
 * @param value - Candidate value.
 * @returns Text or undefined.
 * @example
 * const name = text(value.name);
 */
export function text(value: unknown): string | undefined {
  return Effect.runSync(collectorTextEffect(value));
}
/**
 * Narrows a value to a non-array object record.
 * @param value - Candidate value.
 * @returns True when value is a record.
 * @example
 * if (isRecord(value)) use(value.type);
 */
export function isRecord(value: unknown): value is RecordLike {
  return Effect.runSync(isCollectorRecordEffect(value));
}
