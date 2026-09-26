import { deepFreeze } from "@relkit/contracts";
import { resolveDescriptorIdentityEffect } from "@relkit/invocation";
import { Effect } from "effect";
import { runToolSync, ToolOperationFailure, toolTry } from "./tool-observability.js";
import {
  isFunctionTargetEffect,
  isPositiveIntegerEffect,
  isToolApprovalEffect,
  isToolSideEffectEffect,
} from "./tool-predicates.js";
import type { ToolApproval, ToolSideEffect } from "./define-tool.types.js";
import type { FunctionRefAny, FunctionToolTarget } from "@relkit/functions";

export {
  hasOwn,
  hasOwnEffect,
  isFunctionTarget,
  isFunctionTargetEffect,
  isNonEmptyString,
  isNonEmptyStringEffect,
  isPositiveInteger,
  isPositiveIntegerEffect,
  isRecord,
  isRecordEffect,
  isToolApproval,
  isToolApprovalEffect,
  isToolSideEffect,
  isToolSideEffectEffect,
} from "./tool-predicates.js";

/** Copies and freezes a function target through Effect.
 * @param target - Function reference to validate.
 * @returns Frozen tool target or tagged input failure.
 * @example Effect.runSync(copyFunctionTargetEffect(target));
 */
export const copyFunctionTargetEffect = Effect.fn("tools.copy-target")(
  <Target extends FunctionRefAny>(target: Target) =>
    Effect.gen(function* () {
      const validTarget = yield* isFunctionTargetEffect(target);
      if (!validTarget) {
        return yield* toolTry("copy-target", () => {
          throw new TypeError("Tool target must be a function reference");
        });
      }
      const identity = yield* resolveDescriptorIdentityEffect(target).pipe(
        Effect.mapError(
          (failure) =>
            new ToolOperationFailure({
              operation: "copy-target",
              reason: failure.message,
              cause: failure.cause,
            }),
        ),
      );
      return yield* toolTry("copy-target", () => {
        return deepFreeze({
          ref: Object.freeze({
            kind: "function" as const,
            id: identity.canonical ? identity.id : target.ref.id,
          }),
          input: target.input,
          output: target.output,
          ...(target.errors === undefined ? {} : { errors: Object.freeze([...target.errors]) }),
        }) as FunctionToolTarget<Target>;
      });
    }),
);

/** Copies a validated function target.
 * @param target - Function reference.
 * @returns Frozen target metadata.
 * @throws TypeError when the target is malformed.
 * @example copyFunctionTarget(target);
 */
export function copyFunctionTarget<Target extends FunctionRefAny>(
  target: Target,
): FunctionToolTarget<Target> {
  return runToolSync(copyFunctionTargetEffect(target));
}

/** Validates a tool side-effect policy through Effect.
 * @param value - Candidate policy.
 * @returns Policy or tagged input failure.
 * @example Effect.runSync(validateSideEffectEffect("read"));
 */
export const validateSideEffectEffect = Effect.fn("tools.validate-side-effect")((value: unknown) =>
  Effect.gen(function* () {
    const valid = yield* isToolSideEffectEffect(value);
    return yield* toolTry("validate-side-effect", () => {
      if (!valid) throw new TypeError("Tool sideEffect must be none, read, write, or external");
      return value as ToolSideEffect;
    });
  }),
);

/** Validates a tool side-effect policy.
 * @param value - Candidate policy.
 * @returns Supported policy.
 * @throws TypeError when the policy is unknown.
 * @example validateSideEffect("read");
 */
export function validateSideEffect(value: unknown): ToolSideEffect {
  return runToolSync(validateSideEffectEffect(value));
}

/** Validates a tool approval policy through Effect.
 * @param value - Candidate policy.
 * @returns Policy or tagged input failure.
 * @example Effect.runSync(validateApprovalEffect("never"));
 */
export const validateApprovalEffect = Effect.fn("tools.validate-approval")((value: unknown) =>
  Effect.gen(function* () {
    const valid = yield* isToolApprovalEffect(value);
    return yield* toolTry("validate-approval", () => {
      if (!valid) throw new TypeError("Tool approval must be never, on-write, or always");
      return value as ToolApproval;
    });
  }),
);

/** Validates a tool approval policy.
 * @param value - Candidate policy.
 * @returns Supported policy.
 * @throws TypeError when the policy is unknown.
 * @example validateApproval("never");
 */
export function validateApproval(value: unknown): ToolApproval {
  return runToolSync(validateApprovalEffect(value));
}

/** Requires nonempty trimmed text through Effect.
 * @param value - Candidate text.
 * @param name - Field label.
 * @returns Trimmed text or tagged input failure.
 * @example Effect.runSync(requiredTextEffect(" read ", "description"));
 */
export const requiredTextEffect = Effect.fn("tools.required-text")((value: unknown, name: string) =>
  toolTry("required-text", () => {
    if (typeof value !== "string" || value.trim() === "")
      throw new TypeError(`${name} is required`);
    return value.trim();
  }),
);

/** Requires nonempty trimmed text.
 * @param value - Candidate text.
 * @param name - Field label.
 * @returns Trimmed text.
 * @throws TypeError when the value is empty.
 * @example requiredText(" read ", "description");
 */
export function requiredText(value: unknown, name: string): string {
  return runToolSync(requiredTextEffect(value, name));
}

/** Requires a safe positive integer through Effect.
 * @param value - Candidate number.
 * @param name - Field label.
 * @returns Number or tagged input failure.
 * @example Effect.runSync(positiveIntegerEffect(5, "timeoutMs"));
 */
export const positiveIntegerEffect = Effect.fn("tools.positive-integer")(
  (value: unknown, name: string) =>
    Effect.gen(function* () {
      const valid = yield* isPositiveIntegerEffect(value);
      return yield* toolTry("positive-integer", () => {
        if (!valid) throw new TypeError(`${name} must be a positive integer`);
        return value as number;
      });
    }),
);

/** Asserts a safe positive integer.
 * @param value - Candidate number.
 * @param name - Field label.
 * @returns Nothing when valid.
 * @throws TypeError when the value is invalid.
 * @example positiveInteger(5, "timeoutMs");
 */
export function positiveInteger(value: unknown, name: string): asserts value is number {
  runToolSync(positiveIntegerEffect(value, name));
}
