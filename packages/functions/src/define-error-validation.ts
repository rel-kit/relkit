import { FunctionInputError } from "./function-input-error.js";
import { isStableId } from "@relkit/contracts";
import { normalizeErrorRetry } from "@relkit/invocation";
import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import type { ErrorDescriptorAny, ErrorHttpMapping } from "./define-error.js";
import { functionTry, runFunctionSync } from "./function-observability.js";

/** Checks a declared error descriptor through Effect.
 * @param value - Candidate descriptor.
 * @returns Whether it has the required identity, retry, and constructor shape.
 * @example Effect.runSync(isErrorDescriptorEffect(value));
 */
export const isErrorDescriptorEffect = Effect.fn("functions.error.is-descriptor")(
  (value: unknown) =>
    functionTry("error.is-descriptor", () => {
      if (!isRecord(value)) return false;
      const ref = value.ref;
      try {
        normalizeErrorRetry(value.retry, value.afterMs);
      } catch {
        return false;
      }
      return (
        value.kind === "error" &&
        isStableId(value.id) &&
        isRecord(ref) &&
        ref.kind === "error" &&
        ref.id === value.id &&
        Reflect.ownKeys(ref).length === 2 &&
        typeof value.create === "function"
      );
    }),
);

/** Recognizes a declared error descriptor.
 * @param value - Candidate descriptor.
 * @returns Whether it is a declared error descriptor.
 * @example if (isErrorDescriptor(value)) console.log(value.id);
 */
export function isErrorDescriptor(value: unknown): value is ErrorDescriptorAny {
  return runFunctionSync(isErrorDescriptorEffect(value));
}

/** Validates an HTTP status mapping through Effect.
 * @param http - Optional mapping.
 * @returns Success or a tagged validation error.
 * @example Effect.runSync(validateErrorHttpEffect({ status: 404 }));
 */
export const validateErrorHttpEffect = Effect.fn("functions.error.validate-http")(
  (http: ErrorHttpMapping | undefined) =>
    functionTry("error.validate-http", () => {
      if (
        http !== undefined &&
        (!Number.isInteger(http.status) || http.status < 100 || http.status > 599)
      ) {
        throw new FunctionInputError("Error HTTP status must be an integer from 100 through 599");
      }
    }),
);

/** Validates a declared error HTTP mapping.
 * @param http - Optional mapping.
 * @returns Nothing when valid.
 * @throws TypeError for an invalid status.
 * @example validateErrorHttp({ status: 404 });
 */
export function validateErrorHttp(http: ErrorHttpMapping | undefined): void {
  runFunctionSync(validateErrorHttpEffect(http));
}

/** Validates a Standard Schema through Effect.
 * @param value - Candidate schema.
 * @returns The schema or a tagged validation error.
 * @example Effect.runSync(assertErrorSchemaEffect(z.string()));
 */
export const assertErrorSchemaEffect = Effect.fn("functions.error.assert-schema")(
  (value: unknown) =>
    functionTry("error.assert-schema", () => {
      if (!isRecord(value))
        throw new FunctionInputError("Declared error data must be a Standard Schema v1 validator");
      const standard = value["~standard"];
      if (
        !isRecord(standard) ||
        standard.version !== 1 ||
        typeof standard.validate !== "function"
      ) {
        throw new FunctionInputError("Declared error data must be a Standard Schema v1 validator");
      }
      return value as unknown as StandardSchemaV1;
    }),
);

/** Asserts a declared error data schema.
 * @param value - Candidate schema.
 * @returns Nothing when valid.
 * @throws TypeError for a nonstandard schema.
 * @example assertErrorSchema(z.string());
 */
export function assertErrorSchema(value: unknown): asserts value is StandardSchemaV1 {
  runFunctionSync(assertErrorSchemaEffect(value));
}

/** Checks a record-like value through Effect.
 * @param value - Candidate value.
 * @returns Whether it is a nonarray object or function.
 * @example Effect.runSync(isRecordEffect({}));
 */
export const isRecordEffect = Effect.fn("functions.error.is-record")((value: unknown) =>
  functionTry(
    "error.is-record",
    () =>
      value !== null &&
      (typeof value === "object" || typeof value === "function") &&
      !Array.isArray(value),
  ),
);

/** Recognizes a nonarray record-like value.
 * @param value - Candidate value.
 * @returns Whether it is record-like.
 * @example isRecord({ id: "one" });
 */
export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return runFunctionSync(isRecordEffect(value));
}
