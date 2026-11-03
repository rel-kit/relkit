import { FunctionInputError } from "./function-input-error.js";
import type {
  FunctionToolApproval,
  FunctionToolSideEffect,
  FunctionToolOptions,
} from "./function-tool.js";
import { Effect } from "effect";
import { isRecord } from "./function-tool-shape.js";
import { functionTry, runFunctionSync } from "./function-observability.js";
export { isFunctionTarget, isErrorDescriptor, isRecord, hasOwn } from "./function-tool-shape.js";

/** Validates a side effect policy through Effect.
 * @param value - Candidate policy.
 * @returns Policy or tagged validation failure.
 * @example Effect.runSync(validateSideEffectEffect("read"));
 */
export const validateSideEffectEffect = Effect.fn("functions.tool.validate-side-effect")(
  (value: unknown) =>
    functionTry("tool.validate-side-effect", () => {
      if (value !== "none" && value !== "read" && value !== "write" && value !== "external") {
        throw new FunctionInputError("Tool sideEffect must be none, read, write, or external");
      }
      return value;
    }),
);

/** Validates a tool side effect policy.
 * @param value - Candidate policy.
 * @returns Normalized policy.
 * @throws TypeError for unknown values.
 * @example validateSideEffect("read");
 */
export function validateSideEffect(value: unknown): FunctionToolSideEffect {
  return runFunctionSync(validateSideEffectEffect(value));
}

/** Validates an approval policy through Effect.
 * @param value - Candidate policy.
 * @returns Policy or tagged validation failure.
 * @example Effect.runSync(validateApprovalEffect("always"));
 */
export const validateApprovalEffect = Effect.fn("functions.tool.validate-approval")(
  (value: unknown) =>
    functionTry("tool.validate-approval", () => {
      if (value !== "never" && value !== "on-write" && value !== "always") {
        throw new FunctionInputError("Tool approval must be never, on-write, or always");
      }
      return value;
    }),
);

/** Validates a tool approval policy.
 * @param value - Candidate policy.
 * @returns Normalized policy.
 * @throws TypeError for unknown values.
 * @example validateApproval("always");
 */
export function validateApproval(value: unknown): FunctionToolApproval {
  return runFunctionSync(validateApprovalEffect(value));
}

/** Requires nonempty text through Effect.
 * @param value - Candidate value.
 * @param name - Field label.
 * @returns Trimmed text or tagged validation failure.
 * @example Effect.runSync(requiredTextEffect(" Hello ", "name"));
 */
export const requiredTextEffect = Effect.fn("functions.tool.required-text")(
  (value: unknown, name: string) =>
    functionTry("tool.required-text", () => {
      if (typeof value !== "string" || value.trim() === "")
        throw new FunctionInputError(`${name} is required`);
      return value.trim();
    }),
);

/** Requires nonempty tool text.
 * @param value - Candidate value.
 * @param name - Field label.
 * @returns Trimmed text.
 * @throws TypeError for an empty value.
 * @example requiredText(" Read order ", "description");
 */
export function requiredText(value: unknown, name: string): string {
  return runFunctionSync(requiredTextEffect(value, name));
}

/** Checks a positive integer through Effect.
 * @param value - Candidate number.
 * @param name - Field label.
 * @returns Number or tagged validation failure.
 * @example Effect.runSync(positiveIntegerEffect(5, "timeoutMs"));
 */
export const positiveIntegerEffect = Effect.fn("functions.tool.positive-integer")(
  (value: unknown, name: string) =>
    functionTry("tool.positive-integer", () => {
      if (!Number.isSafeInteger(value) || (value as number) <= 0) {
        throw new FunctionInputError(`${name} must be a positive integer`);
      }
      return value as number;
    }),
);

/** Asserts a positive integer tool field.
 * @param value - Candidate number.
 * @param name - Field label.
 * @returns Nothing when valid.
 * @throws TypeError for invalid input.
 * @example positiveInteger(5, "timeoutMs");
 */
export function positiveInteger(value: unknown, name: string): asserts value is number {
  runFunctionSync(positiveIntegerEffect(value, name));
}

/** Copies validated tool hooks through Effect.
 * @param value - Candidate options.
 * @returns Hook set or tagged validation failure.
 * @example Effect.runSync(copyFunctionToolHooksEffect({ onBefore: (x) => x }));
 */
export const copyFunctionToolHooksEffect = Effect.fn("functions.tool.copy-hooks")(
  (
    value: unknown,
  ): Effect.Effect<
    Pick<FunctionToolOptions, "onBefore" | "onAfter">,
    import("./function-observability.js").FunctionOperationError
  > =>
    functionTry("tool.copy-hooks", () => {
      if (!isRecord(value)) throw new FunctionInputError("Function tool options must be an object");
      if (value.onBefore !== undefined && typeof value.onBefore !== "function") {
        throw new FunctionInputError("Tool onBefore must be a function");
      }
      if (value.onAfter !== undefined && typeof value.onAfter !== "function") {
        throw new FunctionInputError("Tool onAfter must be a function");
      }
      return {
        ...(value.onBefore === undefined ? {} : { onBefore: value.onBefore }),
        ...(value.onAfter === undefined ? {} : { onAfter: value.onAfter }),
      };
    }),
);

/** Copies optional tool hooks.
 * @param value - Candidate options.
 * @returns Hook set.
 * @throws TypeError for malformed hooks.
 * @example copyFunctionToolHooks({ onBefore: (x) => x });
 */
export function copyFunctionToolHooks(
  value: unknown,
): Pick<FunctionToolOptions, "onBefore" | "onAfter"> {
  return runFunctionSync(copyFunctionToolHooksEffect(value));
}
