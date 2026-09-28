import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import type { TaskStreamSchemas } from "./task-types.js";
import {
  assertSchema as assertSchemaValue,
  normalizeVersion as normalizeVersionValue,
  assertInputWireSupport as assertInputWireValue,
  assertCanonicalSchemaSupport as assertCanonicalSchemaValue,
  assertCanonicalStreamSupport as assertCanonicalStreamValue,
} from "./task-validation-value.js";
import { runTaskValidation, taskValidationEffect } from "./task-validation-run.js";
/** Asserts Standard Schema v1 in Effect.
 * @param value - Candidate schema.
 * @param name - Diagnostic field name.
 * @returns Void or TaskValidationFailure.
 * @example Effect.runSync(assertSchemaEffect(z.string(), "Task input"));
 */
export const assertSchemaEffect = Effect.fn("Jobs.assertTaskSchema")(
  (value: unknown, name: string) =>
    taskValidationEffect("taskValidation.assertSchema", () => assertSchemaValue(value, name)),
);
/** Synchronous Standard Schema v1 assertion.
 * @param value - Candidate schema.
 * @param name - Diagnostic field name.
 * @returns Nothing when valid.
 * @throws TypeError for invalid schema.
 * @example assertSchema(z.string(), "Task input");
 */
export function assertSchema(value: unknown, name: string): asserts value is StandardSchemaV1 {
  runTaskValidation(assertSchemaEffect(value, name));
}
/** Normalizes a task version or identifier in Effect.
 * @param value - Candidate identifier.
 * @returns Normalized identifier or TaskValidationFailure.
 * @example Effect.runSync(normalizeVersionEffect("v1"));
 */
export const normalizeVersionEffect = Effect.fn("Jobs.normalizeTaskVersion")((value: unknown) =>
  taskValidationEffect("taskValidation.normalizeVersion", () => normalizeVersionValue(value)),
);
/** Synchronous task version normalizer.
 * @param value - Candidate identifier.
 * @returns Normalized identifier.
 * @throws Original invalid identifier error.
 * @example normalizeVersion("v1");
 */
export function normalizeVersion(value: unknown): string {
  return runTaskValidation(normalizeVersionEffect(value));
}
/** Checks canonical support for input and optional inputWire in Effect.
 * @param input - Caller input schema.
 * @param inputWire - Optional canonical identity schema.
 * @returns Void or TaskValidationFailure.
 * @example Effect.runSync(assertInputWireSupportEffect(z.string(), undefined));
 */
export const assertInputWireSupportEffect = Effect.fn("Jobs.assertTaskInputWire")(
  (input: StandardSchemaV1, inputWire: unknown) =>
    taskValidationEffect("taskValidation.inputWire", () => assertInputWireValue(input, inputWire)),
);
/** Synchronous task inputWire support assertion.
 * @param input - Caller input schema.
 * @param inputWire - Optional canonical identity schema.
 * @returns Nothing when valid.
 * @throws TypeError for noncanonical input support.
 * @example assertInputWireSupport(z.string(), undefined);
 */
export function assertInputWireSupport(input: StandardSchemaV1, inputWire: unknown): void {
  runTaskValidation(assertInputWireSupportEffect(input, inputWire));
}
/** Checks canonical schema projection in Effect.
 * @param schema - Candidate schema.
 * @param name - Diagnostic field name.
 * @param allowVoid - Whether void is valid.
 * @returns Void or TaskValidationFailure.
 * @example Effect.runSync(assertCanonicalSchemaSupportEffect(z.string(), "output"));
 */
export const assertCanonicalSchemaSupportEffect = Effect.fn("Jobs.assertTaskCanonicalSchema")(
  (schema: StandardSchemaV1, name: string, allowVoid = false) =>
    taskValidationEffect("taskValidation.canonicalSchema", () =>
      assertCanonicalSchemaValue(schema, name, allowVoid),
    ),
);
/** Synchronous canonical schema assertion.
 * @param schema - Candidate schema.
 * @param name - Diagnostic field name.
 * @param allowVoid - Whether void is valid.
 * @returns Nothing when valid.
 * @throws TypeError for unsupported schema projections.
 * @example assertCanonicalSchemaSupport(z.string(), "output");
 */
export function assertCanonicalSchemaSupport(
  schema: StandardSchemaV1,
  name: string,
  allowVoid = false,
): void {
  runTaskValidation(assertCanonicalSchemaSupportEffect(schema, name, allowVoid));
}
/** Checks each named stream schema in Effect.
 * @param streams - Optional stream schema map.
 * @returns Void or TaskValidationFailure.
 * @example Effect.runSync(assertCanonicalStreamSupportEffect({ text: z.string() }));
 */
export const assertCanonicalStreamSupportEffect = Effect.fn("Jobs.assertTaskStreams")(
  (streams: TaskStreamSchemas | undefined) =>
    taskValidationEffect("taskValidation.canonicalStreams", () =>
      assertCanonicalStreamValue(streams),
    ),
);
/** Synchronous named stream schema assertion.
 * @param streams - Optional stream schema map.
 * @returns Nothing when valid.
 * @throws TypeError for noncanonical stream schemas.
 * @example assertCanonicalStreamSupport({ text: z.string() });
 */
export function assertCanonicalStreamSupport(streams: TaskStreamSchemas | undefined): void {
  runTaskValidation(assertCanonicalStreamSupportEffect(streams));
}
