import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import {
  utf8Bytes as utf8BytesValue,
  assertBoundedString as assertBoundedStringValue,
  assertFieldName as assertFieldNameValue,
  memoryBytes as memoryBytesValue,
  assertCanonicalScalarKey as assertCanonicalScalarKeyValue,
  TASK_KEY_MAX_BYTES,
} from "./task-policy-value.js";
import { runTaskValidation, taskValidationEffect } from "./task-validation-run.js";
/** Counts encoded UTF-8 bytes in Effect.
 * @param value - Text to measure.
 * @returns UTF-8 byte count; no expected failure.
 * @example Effect.runSync(utf8BytesEffect("hello"));
 */
export const utf8BytesEffect = Effect.fn("Jobs.utf8TaskBytes")((value: string) =>
  taskValidationEffect("taskPolicy.utf8Bytes", () => utf8BytesValue(value)),
);
/** Synchronous UTF-8 byte count.
 * @param value - Text to measure.
 * @returns UTF-8 byte count.
 * @example utf8Bytes("hello");
 */
export function utf8Bytes(value: string): number {
  return runTaskValidation(utf8BytesEffect(value));
}
/** Checks nonempty bounded UTF-8 text in Effect.
 * @param value - Candidate text.
 * @param name - Diagnostic field name.
 * @param maxBytes - Maximum UTF-8 bytes.
 * @returns Void or TaskValidationFailure.
 * @example Effect.runSync(assertBoundedStringEffect("tag", "Task tag"));
 */
export const assertBoundedStringEffect = Effect.fn("Jobs.assertTaskBoundedString")(
  (value: unknown, name: string, maxBytes = TASK_KEY_MAX_BYTES) =>
    taskValidationEffect("taskPolicy.boundedString", () =>
      assertBoundedStringValue(value, name, maxBytes),
    ),
);
/** Synchronous bounded string assertion.
 * @param value - Candidate text.
 * @param name - Diagnostic field name.
 * @param maxBytes - Maximum UTF-8 bytes.
 * @returns Nothing when valid.
 * @throws TypeError for invalid text.
 * @example assertBoundedString("tag", "Task tag");
 */
export function assertBoundedString(
  value: unknown,
  name: string,
  maxBytes = TASK_KEY_MAX_BYTES,
): asserts value is string {
  runTaskValidation(assertBoundedStringEffect(value, name, maxBytes));
}
/** Checks a top-level canonical field name in Effect.
 * @param value - Candidate field name.
 * @param name - Diagnostic field name.
 * @returns Void or TaskValidationFailure.
 * @example Effect.runSync(assertFieldNameEffect("tenantId"));
 */
export const assertFieldNameEffect = Effect.fn("Jobs.assertTaskFieldName")(
  (value: unknown, name = "field name") =>
    taskValidationEffect("taskPolicy.fieldName", () => assertFieldNameValue(value, name)),
);
/** Synchronous top-level field name assertion.
 * @param value - Candidate field name.
 * @param name - Diagnostic field name.
 * @returns Nothing when valid.
 * @throws TypeError for invalid paths or expressions.
 * @example assertFieldName("tenantId");
 */
export function assertFieldName(value: unknown, name = "field name"): asserts value is string {
  runTaskValidation(assertFieldNameEffect(value, name));
}
/** Parses an exact MiB or GiB memory quantity in Effect.
 * @param value - Readable memory quantity.
 * @returns Exact safe byte count or TaskValidationFailure.
 * @example Effect.runSync(memoryBytesEffect("1 GiB"));
 */
export const memoryBytesEffect = Effect.fn("Jobs.taskMemoryBytes")((value: string) =>
  taskValidationEffect("taskPolicy.memoryBytes", () => memoryBytesValue(value)),
);
/** Synchronous memory quantity parser.
 * @param value - Readable memory quantity.
 * @returns Exact safe byte count.
 * @throws TypeError for invalid or unsafe quantities.
 * @example memoryBytes("1 GiB");
 */
export function memoryBytes(value: string): number {
  return runTaskValidation(memoryBytesEffect(value));
}
/** Checks that a concurrency key is a required canonical scalar in Effect.
 * @param schema - Canonical object schema.
 * @param key - Candidate field name.
 * @param name - Diagnostic field name.
 * @returns Void or TaskValidationFailure.
 * @example Effect.runSync(assertCanonicalScalarKeyEffect(schema, "tenantId", "concurrency.key"));
 */
export const assertCanonicalScalarKeyEffect = Effect.fn("Jobs.assertTaskScalarKey")(
  (schema: StandardSchemaV1, key: string, name: string) =>
    taskValidationEffect("taskPolicy.scalarKey", () =>
      assertCanonicalScalarKeyValue(schema, key, name),
    ),
);
/** Synchronous required canonical scalar key assertion.
 * @param schema - Canonical object schema.
 * @param key - Candidate field name.
 * @param name - Diagnostic field name.
 * @returns Nothing when valid.
 * @throws TypeError for unsupported projections or fields.
 * @example assertCanonicalScalarKey(schema, "tenantId", "concurrency.key");
 */
export function assertCanonicalScalarKey(
  schema: StandardSchemaV1,
  key: string,
  name: string,
): void {
  runTaskValidation(assertCanonicalScalarKeyEffect(schema, key, name));
}
