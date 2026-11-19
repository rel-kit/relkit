import { Effect } from "effect";
import type { JsonValue } from "../contracts/index.js";
import { redactNamedFields as redactFields } from "./redaction-core.js";
import type {
  NormalizedRedactionPolicy,
  RedactedCapture,
  RedactionPolicy,
} from "./redaction.types.js";
import {
  captureRedactedEffect,
  createRedactionPolicyEffect,
  redactRecordEffect,
  type RedactionError,
} from "./redaction-effect.js";
export type { RedactedCapture, RedactionMode, RedactionPolicy } from "./redaction.types.js";
export { DEFAULT_REDACTION_KEYS } from "./redaction-core.js";
export {
  RedactionError,
  captureRedactedEffect,
  createRedactionPolicyEffect,
  redactRecordEffect,
} from "./redaction-effect.js";
function run<A>(effect: Effect.Effect<A, RedactionError>): A {
  return Effect.runSync(
    effect.pipe(
      Effect.catchTag("RedactionError", (error) =>
        Effect.sync(() => {
          throw new TypeError(error.message);
        }),
      ),
    ),
  );
}
/**
 * Normalizes and validates a redaction policy.
 * @param value - Input policy.
 * @returns A frozen policy with default sensitive keys.
 * @throws {TypeError} If the mode, size, or keys are invalid.
 * @example
 * const policy = createRedactionPolicy({ mode: "off" });
 */
export function createRedactionPolicy(value: RedactionPolicy = {}): NormalizedRedactionPolicy {
  return run(createRedactionPolicyEffect(value));
}
/**
 * Redacts a value and returns safe immutable JSON.
 * @param value - Candidate value.
 * @param policy - Optional redaction policy.
 * @returns A safe JSON value.
 * @throws {TypeError} If the redaction policy is invalid.
 * @example
 * const safe = redactRecord({ token: "secret" });
 */
export function redactRecord(value: unknown, policy?: RedactionPolicy): JsonValue {
  return run(redactRecordEffect(value, policy));
}
/** Compatibility alias for record redaction. */
export const admitRecord = redactRecord;
/** Compatibility alias for value redaction. */
export const redactValue = redactRecord;
/**
 * Creates a size-bounded development capture after redaction.
 * @param value - Candidate capture value.
 * @param policy - Required capture policy.
 * @returns An optional safe capture.
 * @throws {TypeError} If the capture policy is invalid.
 * @example
 * const capture = captureRedacted(value, { mode: "development-redacted", maxBytes: 1024 });
 */
export function captureRedacted(
  value: unknown,
  policy: RedactionPolicy,
): RedactedCapture | undefined {
  return run(captureRedactedEffect(value, policy));
}
/**
 * Replaces the named fields of a value with the redaction marker, before the value is recorded.
 * A name matches a key anywhere in the value; a dotted path such as `customer.email` matches from
 * the value's root. An event's `sensitiveFields` are applied to its payload with this function.
 * @param value - The value about to be recorded; it is not changed.
 * @param fields - Field names or dotted paths.
 * @returns A JSON copy with the marker in place of each named field, or the value when no field is named.
 * @example
 * const safe = redactNamedFields({ cardNumber: "4111" }, ["cardNumber"]); // { cardNumber: "[REDACTED]" }
 */
export function redactNamedFields(value: unknown, fields: readonly string[]): unknown {
  return redactFields(value, fields);
}
