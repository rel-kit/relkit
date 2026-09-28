import { Effect, Metric } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import {
  AgentValidationError,
  validationCount,
  validationFailures,
} from "./agent-validation-error.js";

/**
 * Validates a finite positive integer with a typed Effect failure.
 *
 * @param value - Candidate number.
 * @param name - Stable field name for diagnostics.
 * @returns An Effect with the number or an AgentValidationError.
 * @example
 * const limit = Effect.runSync(positiveIntegerEffect(3, "maxSteps"));
 */
export const positiveIntegerEffect = Effect.fn("Agents.validation.positiveInteger")(function* (
  value: unknown,
  name: string,
) {
  yield* Metric.update(validationCount, 1);
  if (!positiveIntegerShape(value)) {
    yield* Metric.update(validationFailures, 1);
    return yield* Effect.fail(
      new AgentValidationError({
        operation: "positiveInteger",
        message: `${name} must be a finite positive integer`,
      }),
    );
  }
  return value;
}, (effect) => observeAgent("validation.positive-integer", effect));

/**
 * Validates a finite positive integer for existing synchronous callers.
 *
 * @param value - Candidate number.
 * @param name - Field name for diagnostics.
 * @returns The validated number.
 * @throws TypeError when the value is not a finite positive integer.
 * @example
 * const limit = positiveInteger(3, "maxSteps");
 */
export function positiveInteger(value: unknown, name: string): number {
  return Effect.runSync(
    positiveIntegerEffect(value, name).pipe(
      Effect.catchTag("AgentValidationError", (error) =>
        Effect.sync(() => {
          throw new TypeError(error.message);
        }),
      ),
    ),
  );
}

/**
 * Checks for a finite positive integer without throwing.
 *
 * @param value - Candidate number.
 * @returns An Effect with a boolean; it has no typed failure.
 * @example
 * const valid = Effect.runSync(isPositiveIntegerEffect(3));
 */
export const isPositiveIntegerEffect = Effect.fn("Agents.validation.isPositiveInteger")(function* (
  value: unknown,
) {
  const valid = yield* Effect.sync(() => positiveIntegerShape(value));
  yield* Metric.update(validationCount, 1);
  return valid;
}, (effect) => observeAgent("validation.is-positive-integer", effect));

/**
 * Checks a finite positive integer for existing synchronous callers.
 *
 * @param value - Candidate number.
 * @returns True when the value is a finite positive integer.
 * @example
 * if (isPositiveInteger(value)) console.log(value + 1);
 */
export function isPositiveInteger(value: unknown): value is number {
  return Effect.runSync(isPositiveIntegerEffect(value));
}

/**
 * Checks a non-null, non-array record through an Effect operation.
 *
 * @param value - Candidate record.
 * @returns An Effect with a boolean; it has no typed failure.
 * @example
 * const valid = Effect.runSync(isRecordEffect({ id: "one" }));
 */
export const isRecordEffect = Effect.fn("Agents.validation.isRecord")(function* (value: unknown) {
  const valid = yield* Effect.sync(() => recordShape(value));
  yield* Metric.update(validationCount, 1);
  return valid;
}, (effect) => observeAgent("validation.is-record", effect));

/**
 * Checks a record for existing synchronous callers.
 *
 * @param value - Candidate record.
 * @returns True when the value is a non-null, non-array object.
 * @example
 * if (isRecord(value)) console.log(value.id);
 */
export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return Effect.runSync(isRecordEffect(value));
}

function positiveIntegerShape(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

function recordShape(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
