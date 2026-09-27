import { assertJsonValue } from "@relkit/contracts";
import type { JsonValue } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { RouteInputError, routeTry, runRouteSync } from "./route-observability.js";

/** Checks a Standard Schema validator through Effect.
 * @param value - Candidate schema.
 * @returns Whether the value implements Standard Schema v1.
 * @example Effect.runSync(isSchemaEffect(schema));
 */
export const isSchemaEffect = Effect.fn("routes.validation.is-schema")((value: unknown) =>
  routeTry("validation.is-schema", () => isSchemaValue(value)),
);

/** Checks a Standard Schema validator synchronously.
 * @param value - Candidate schema.
 * @returns Whether the value implements Standard Schema v1.
 * @example isSchema(schema);
 */
export function isSchema(value: unknown): value is StandardSchemaV1 {
  return runRouteSync(isSchemaEffect(value));
}
/** Checks the Standard Schema shape inside a parent operation.
 * @param value - Candidate schema.
 * @returns Whether it implements Standard Schema v1.
 * @example isSchemaValue(z.string());
 */
export function isSchemaValue(value: unknown): value is StandardSchemaV1 {
  return (
    isRecordValue(value) &&
    isRecordValue(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}
/** Asserts a Standard Schema validator through Effect.
 * @param value - Candidate schema.
 * @param name - Fixed schema label.
 * @returns Void or tagged invalid-input failure.
 * @example Effect.runSync(assertSchemaEffect(schema, "response schema"));
 */
export const assertSchemaEffect = Effect.fn("routes.validation.assert-schema")(
  (value: unknown, name: string) =>
    routeTry("validation.assert-schema", () => assertSchemaValue(value, name)),
);

/** Asserts a Standard Schema validator synchronously.
 * @param value - Candidate schema.
 * @param name - Fixed schema label.
 * @returns Nothing when valid.
 * @throws TypeError for invalid schemas.
 * @example assertSchema(schema, "response schema");
 */
export function assertSchema(value: unknown, name: string): asserts value is StandardSchemaV1 {
  runRouteSync(assertSchemaEffect(value, name));
}

/** Validates a schema inside an already observed operation.
 * @param value - Candidate schema.
 * @param name - Field name for the error.
 * @returns Nothing when valid.
 * @throws RouteInputError for an invalid schema.
 * @example assertSchemaValue(schema, "response schema");
 */
export function assertSchemaValue(value: unknown, name: string): asserts value is StandardSchemaV1 {
  if (!isSchemaValue(value))
    throw new RouteInputError(`${name} must be a Standard Schema v1 validator`);
}

/** Checks an HTTP response status through Effect.
 * @param value - Candidate status.
 * @returns Whether the status is an integer from 100 through 599.
 * @example Effect.runSync(isStatusEffect(200));
 */
export const isStatusEffect = Effect.fn("routes.validation.is-status")((value: unknown) =>
  routeTry("validation.is-status", () => isStatusValue(value)),
);

/** Checks an HTTP response status synchronously.
 * @param value - Candidate status.
 * @returns Whether the status is an integer from 100 through 599.
 * @example isStatus(200);
 */
export function isStatus(value: unknown): value is number {
  return runRouteSync(isStatusEffect(value));
}
/** Checks an HTTP status inside response validation.
 * @param value - Candidate status.
 * @returns Whether it is an integer from 100 through 599.
 * @example isStatusValue(200);
 */
export function isStatusValue(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599;
}
/** Checks JSON compatibility without leaking a validation exception.
 * @param value - Candidate value.
 * @returns Whether it is serializable JSON data.
 * @example isJsonValue({ ok: true });
 */
export function isJsonValue(value: unknown): value is JsonValue {
  try {
    assertJsonValue(value);
    return true;
  } catch {
    return false;
  }
}
/** Checks that a mapping has only its allowed own property names.
 * @param value - Mapping object.
 * @param keys - Allowed property names.
 * @returns Whether every own key is allowed.
 * @example ownKeys({ kind: "continue" }, "kind");
 */
export function ownKeys(value: object, ...keys: string[]): boolean {
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key));
}
/** Checks an ordinary non-array object through Effect.
 * @param value - Candidate value.
 * @returns Whether it is a record.
 * @example Effect.runSync(isRecordEffect({}));
 */
export const isRecordEffect = Effect.fn("routes.validation.is-record")((value: unknown) =>
  routeTry("validation.is-record", () => isRecordValue(value)),
);

/** Checks an ordinary non-array object synchronously.
 * @param value - Candidate value.
 * @returns Whether it is a record.
 * @example isRecord({});
 */
export function isRecord(value: unknown): value is Record<string, any> {
  return runRouteSync(isRecordEffect(value));
}
/** Checks the object shape inside another observed operation.
 * @param value - Candidate value.
 * @returns Whether it is a non-array object.
 * @example isRecordValue({ kind: "path" });
 */
export function isRecordValue(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
