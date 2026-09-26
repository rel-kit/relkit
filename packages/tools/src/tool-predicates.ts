import { isRef } from "@relkit/contracts";
import { isErrorDescriptor } from "@relkit/functions";
import { Effect } from "effect";
import { observeTool, runToolSync } from "./tool-observability.js";

/** Checks a tool side-effect policy through Effect.
 * @param value - Candidate policy.
 * @returns Whether the value is a supported policy; never fails.
 * @example Effect.runSync(isToolSideEffectEffect("read"));
 */
export const isToolSideEffectEffect = Effect.fn("tools.is-side-effect")((value: unknown) =>
  observeTool(
    "is-side-effect",
    Effect.sync(
      () => value === "none" || value === "read" || value === "write" || value === "external",
    ),
  ),
);

/** Checks a tool side-effect policy.
 * @param value - Candidate policy.
 * @returns Whether the policy is supported.
 * @example isToolSideEffect("read");
 */
export function isToolSideEffect(
  value: unknown,
): value is import("./define-tool.types.js").ToolSideEffect {
  return runToolSync(isToolSideEffectEffect(value));
}

/** Checks a tool approval policy through Effect.
 * @param value - Candidate policy.
 * @returns Whether the value is supported; never fails.
 * @example Effect.runSync(isToolApprovalEffect("never"));
 */
export const isToolApprovalEffect = Effect.fn("tools.is-approval")((value: unknown) =>
  observeTool(
    "is-approval",
    Effect.sync(() => value === "never" || value === "on-write" || value === "always"),
  ),
);

/** Checks a tool approval policy.
 * @param value - Candidate policy.
 * @returns Whether the policy is supported.
 * @example isToolApproval("never");
 */
export function isToolApproval(
  value: unknown,
): value is import("./define-tool.types.js").ToolApproval {
  return runToolSync(isToolApprovalEffect(value));
}

/** Checks a safe positive integer through Effect.
 * @param value - Candidate number.
 * @returns Whether the value is a safe positive integer; never fails.
 * @example Effect.runSync(isPositiveIntegerEffect(2));
 */
export const isPositiveIntegerEffect = Effect.fn("tools.is-positive-integer")((value: unknown) =>
  observeTool(
    "is-positive-integer",
    Effect.sync(() => Number.isSafeInteger(value) && typeof value === "number" && value > 0),
  ),
);

/** Checks a safe positive integer.
 * @param value - Candidate number.
 * @returns Whether the value is a safe positive integer.
 * @example isPositiveInteger(2);
 */
export function isPositiveInteger(value: unknown): value is number {
  return runToolSync(isPositiveIntegerEffect(value));
}

/** Checks a nonempty string through Effect.
 * @param value - Candidate text.
 * @returns Whether the value has nonwhitespace content; never fails.
 * @example Effect.runSync(isNonEmptyStringEffect("hello"));
 */
export const isNonEmptyStringEffect = Effect.fn("tools.is-non-empty-string")((value: unknown) =>
  observeTool(
    "is-non-empty-string",
    Effect.sync(() => typeof value === "string" && value.trim() !== ""),
  ),
);

/** Checks a nonempty string.
 * @param value - Candidate text.
 * @returns Whether text has nonwhitespace content.
 * @example isNonEmptyString("hello");
 */
export function isNonEmptyString(value: unknown): value is string {
  return runToolSync(isNonEmptyStringEffect(value));
}

/** Checks a plain non-array object through Effect.
 * @param value - Candidate record.
 * @returns Whether the value is a record; never fails.
 * @example Effect.runSync(isRecordEffect({ id: 1 }));
 */
export const isRecordEffect = Effect.fn("tools.is-record")((value: unknown) =>
  observeTool(
    "is-record",
    Effect.sync(() => rawIsRecord(value)),
  ),
);

/** Checks a plain non-array object.
 * @param value - Candidate record.
 * @returns Whether the value is a record.
 * @example isRecord({ id: 1 });
 */
export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return runToolSync(isRecordEffect(value));
}

/** Checks an own property through Effect.
 * @param value - Candidate object.
 * @param key - Property key.
 * @returns Whether the object owns the key; never fails.
 * @example Effect.runSync(hasOwnEffect({ id: 1 }, "id"));
 */
export const hasOwnEffect = Effect.fn("tools.has-own")((value: object, key: PropertyKey) =>
  observeTool(
    "has-own",
    Effect.sync(() => Object.prototype.hasOwnProperty.call(value, key)),
  ),
);

/** Checks an own property.
 * @param value - Candidate object.
 * @param key - Property key.
 * @returns Whether the object owns the key.
 * @example hasOwn({ id: 1 }, "id");
 */
export function hasOwn(value: object, key: PropertyKey): boolean {
  return runToolSync(hasOwnEffect(value, key));
}

/** Checks a function target through Effect.
 * @param value - Candidate reference.
 * @returns Whether the target carries valid schemas; never fails.
 * @example Effect.runSync(isFunctionTargetEffect(target));
 */
export const isFunctionTargetEffect = Effect.fn("tools.is-function-target")((value: unknown) =>
  observeTool(
    "is-function-target",
    Effect.sync(
      () =>
        rawIsRecord(value) &&
        isRef(value.ref, "function") &&
        isSchema(value.input) &&
        isSchema(value.output) &&
        (!Object.prototype.hasOwnProperty.call(value, "handler") ||
          typeof value.handler === "function") &&
        (value.errors === undefined ||
          (Array.isArray(value.errors) && value.errors.every(isErrorDescriptor))),
    ),
  ),
);

/** Checks a function target.
 * @param value - Candidate reference.
 * @returns Whether the target is usable by a tool.
 * @example isFunctionTarget(target);
 */
export function isFunctionTarget(
  value: unknown,
): value is import("@relkit/functions").FunctionRefAny {
  return runToolSync(isFunctionTargetEffect(value));
}

function rawIsRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSchema(value: unknown): boolean {
  if (!rawIsRecord(value) || !rawIsRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}
