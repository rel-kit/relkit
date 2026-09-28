import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { EventDefinitionError } from "./event-errors.js";
import { runEventSync } from "./event-observability.js";

/** Checks the Standard Schema v1 runtime contract.
 * @param value - Candidate schema.
 * @returns Whether it has the required validator.
 * @example isSchema(schema)
 */
export function isSchema(value: unknown): value is StandardSchemaV1 {
  return runEventSync(isSchemaEffect(value));
}

/** Effect implementation of the Standard Schema predicate.
 * @param value - Candidate schema.
 * @returns An Effect succeeding with a boolean and no expected failure.
 * @example Effect.runSync(isSchemaEffect(schema))
 */
export const isSchemaEffect = Effect.fn("Events.isSchema")((value: unknown) =>
  Effect.sync(() => {
    if (!recordShape(value) || !recordShape(value["~standard"])) return false;
    return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
  }),
);

/** Checks whether a value is a non-array object.
 * @param value - Candidate value.
 * @returns Whether it can carry descriptor fields.
 * @example isRecord({ id: "orders.created" })
 */
export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return runEventSync(isRecordEffect(value));
}

/** Effect implementation of the descriptor record predicate.
 * @param value - Candidate value.
 * @returns An Effect succeeding with a boolean and no expected failure.
 * @example Effect.runSync(isRecordEffect({ id: "orders.created" }))
 */
export const isRecordEffect = Effect.fn("Events.descriptorIsRecord")((value: unknown) =>
  Effect.sync(() => recordShape(value)),
);

/** Checks whether a descriptor owns a named property.
 * @param value - Descriptor object.
 * @param key - Property to test.
 * @returns Whether the property is directly declared.
 * @example hasOwn({ id: "orders.created" }, "id")
 */
export function hasOwn(value: object, key: PropertyKey): boolean {
  return runEventSync(hasOwnEffect(value, key));
}

/** Effect implementation of direct property ownership detection.
 * @param value - Candidate object.
 * @param key - Property to test.
 * @returns An Effect succeeding with a boolean and no expected failure.
 * @example Effect.runSync(hasOwnEffect({ id: "orders.created" }, "id"))
 */
export const hasOwnEffect = Effect.fn("Events.hasOwn")((value: object, key: PropertyKey) =>
  Effect.sync(() => Object.prototype.hasOwnProperty.call(value, key)),
);

/** Checks for a positive safe version number.
 * @param value - Candidate version.
 * @returns Whether it is a positive safe integer.
 * @example isPositiveInteger(1)
 */
export function isPositiveInteger(value: unknown): value is number {
  return runEventSync(isPositiveIntegerEffect(value));
}

/** Effect implementation of the positive safe integer predicate.
 * @param value - Candidate number.
 * @returns An Effect succeeding with a boolean and no expected failure.
 * @example Effect.runSync(isPositiveIntegerEffect(1))
 */
export const isPositiveIntegerEffect = Effect.fn("Events.isPositiveInteger")((value: unknown) =>
  Effect.sync(() => typeof value === "number" && Number.isSafeInteger(value) && value > 0),
);

/** Requires a positive safe version number.
 * @param value - Candidate version.
 * @returns Void after validation.
 * @throws TypeError for an invalid version.
 * @example validateVersion(1)
 */
export function validateVersion(value: unknown): asserts value is number {
  try {
    runEventSync(validateVersionEffect(value));
  } catch (error) {
    if (error instanceof EventDefinitionError) throw new TypeError(error.message);
    throw error;
  }
}

/** Requires a positive safe version in the Effect error channel.
 * @param value - Candidate version.
 * @returns An Effect succeeding with the version or failing with EventDefinitionError.
 * @example Effect.runSync(validateVersionEffect(1))
 */
export const validateVersionEffect = Effect.fn("Events.validateVersion")((value: unknown) =>
  Effect.gen(function* () {
    if (!(yield* isPositiveIntegerEffect(value)))
      return yield* new EventDefinitionError({
        message: "Event version must be a positive integer",
      });
    return value as number;
  }),
);

function recordShape(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
