import { Effect } from "effect";
import type { ObservabilityStreamEventType } from "./stream-types.js";
import { ObservabilityStreamError } from "./stream-types.js";
import {
  assertStreamTypeEffect,
  boundedStreamEffect,
  invalidStreamErrorEffect,
  positiveStreamEffect,
  resolveCursorEffect,
  validateCursorEffect,
  type StreamValidationError,
} from "./stream-utils-effect.js";
function run<A>(effect: Effect.Effect<A, StreamValidationError>): A {
  return Effect.runSync(
    effect.pipe(
      Effect.catchTag("StreamValidationError", (error) =>
        Effect.sync(() => {
          throw new ObservabilityStreamError(error.code, error.message);
        }),
      ),
    ),
  );
}
/**
 * Resolves compatible cursor fields.
 * @param value - Candidate cursor fields.
 * @returns The selected cursor, if provided.
 * @throws {ObservabilityStreamError} If both fields disagree.
 * @example
 * const cursor = resolveCursor({ afterCursor: "1" });
 */
export function resolveCursor(value: {
  readonly cursor?: string;
  readonly afterCursor?: string;
}): string | undefined {
  return run(resolveCursorEffect(value));
}
/**
 * Checks a cursor against the retained window.
 * @param value - Decimal cursor text.
 * @param latest - Latest cursor.
 * @param earliest - Earliest retained cursor, if known.
 * @returns Void when the cursor is valid.
 * @throws {ObservabilityStreamError} If invalid, expired, or ahead.
 * @example
 * validateCursor("3", 4, "2");
 */
export function validateCursor(value: string, latest: number, earliest?: string): void {
  run(validateCursorEffect(value, latest, earliest));
}
/**
 * Checks a positive stream bound.
 * @param value - Requested bound.
 * @param name - Field name for error text.
 * @returns The valid bound.
 * @throws {ObservabilityStreamError} If invalid.
 * @example
 * const size = positive(8, "queue");
 */
export function positive(value: number, name: string): number {
  return run(positiveStreamEffect(value, name));
}
/**
 * Clamps a positive bound to its maximum.
 * @param value - Requested bound.
 * @param maximum - Maximum allowed bound.
 * @param name - Field name for error text.
 * @returns The clamped bound.
 * @throws {ObservabilityStreamError} If invalid.
 * @example
 * const size = bounded(100, 64, "queue");
 */
export function bounded(value: number, maximum: number, name: string): number {
  return run(boundedStreamEffect(value, maximum, name));
}
/**
 * Narrows a valid event type.
 * @param value - Event type to check.
 * @returns Void after type narrowing.
 * @throws {ObservabilityStreamError} If unsupported.
 * @example
 * assertType("log.emitted");
 */
export function assertType(value: string): asserts value is ObservabilityStreamEventType {
  run(assertStreamTypeEffect(value));
}
/**
 * Creates the compatible invalid-input error.
 * @param message - Error text.
 * @returns An ObservabilityStreamError with the invalid-input code.
 * @example
 * throw invalid("stream cursor is invalid");
 */
export function invalid(message: string): ObservabilityStreamError {
  return run(invalidStreamErrorEffect(message));
}
