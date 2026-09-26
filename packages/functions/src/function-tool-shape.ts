import { isRef, isStableId } from "@relkit/contracts";
import { Effect } from "effect";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionRefAny } from "./types.js";
import { functionTry, runFunctionSync } from "./function-observability.js";

/** Checks a callable function target through Effect.
 * @param value - Candidate target.
 * @returns Whether it meets the tool target contract.
 * @example Effect.runSync(isFunctionTargetEffect(fn));
 */
export const isFunctionTargetEffect = Effect.fn("functions.tool.is-target")((value: unknown) =>
  functionTry(
    "tool.is-target",
    () =>
      isRecord(value) &&
      value.invocationMode !== "event-only" &&
      isRef(value.ref, "function") &&
      isSchema(value.input) &&
      isSchema(value.output) &&
      (!hasOwn(value, "handler") || typeof value.handler === "function") &&
      (!hasOwn(value, "invoke") || typeof value.invoke === "function") &&
      (value.errors === undefined ||
        (Array.isArray(value.errors) && value.errors.every(isErrorDescriptor))),
  ),
);

/** Recognizes a function usable as a tool target.
 * @param value - Candidate target.
 * @returns Whether it is callable through the function runtime.
 * @example if (isFunctionTarget(value)) console.log(value.ref.id);
 */
export function isFunctionTarget(value: unknown): value is FunctionRefAny {
  return runFunctionSync(isFunctionTargetEffect(value));
}

/** Checks a declared error shape through Effect.
 * @param value - Candidate descriptor.
 * @returns Whether it has the required error fields.
 * @example Effect.runSync(isErrorDescriptorEffect(value));
 */
export const isErrorDescriptorEffect = Effect.fn("functions.tool.is-error-descriptor")(
  (value: unknown) =>
    functionTry("tool.is-error-descriptor", () => {
      if (!isRecord(value) || value.kind !== "error" || !isStableId(value.id)) return false;
      const ref = value.ref;
      return (
        isRecord(ref) &&
        ref.kind === "error" &&
        ref.id === value.id &&
        typeof value.create === "function"
      );
    }),
);

/** Recognizes an error descriptor accepted by tool metadata.
 * @param value - Candidate descriptor.
 * @returns Whether it has the required shape.
 * @example isErrorDescriptor(value);
 */
export function isErrorDescriptor(value: unknown): value is ErrorDescriptorAny {
  return runFunctionSync(isErrorDescriptorEffect(value));
}

function isSchema(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}

/** Checks a record-like value through Effect.
 * @param value - Candidate value.
 * @returns Whether it is a nonarray object or function.
 * @example Effect.runSync(isRecordEffect({}));
 */
export const isRecordEffect = Effect.fn("functions.tool.is-record")((value: unknown) =>
  functionTry(
    "tool.is-record",
    () =>
      value !== null &&
      (typeof value === "object" || typeof value === "function") &&
      !Array.isArray(value),
  ),
);

/** Recognizes a record-like tool value.
 * @param value - Candidate value.
 * @returns Whether it is record-like.
 * @example isRecord({ id: "one" });
 */
export function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return runFunctionSync(isRecordEffect(value));
}

/** Checks an own property through Effect.
 * @param value - Object to inspect.
 * @param key - Property key.
 * @returns Whether the object owns that key.
 * @example Effect.runSync(hasOwnEffect({}, "id"));
 */
export const hasOwnEffect = Effect.fn("functions.tool.has-own")((value: object, key: PropertyKey) =>
  functionTry("tool.has-own", () => Object.prototype.hasOwnProperty.call(value, key)),
);

/** Checks whether an object owns a property.
 * @param value - Object to inspect.
 * @param key - Property key.
 * @returns Whether the key is directly owned.
 * @example hasOwn({ id: "one" }, "id");
 */
export function hasOwn(value: object, key: PropertyKey): boolean {
  return runFunctionSync(hasOwnEffect(value, key));
}
