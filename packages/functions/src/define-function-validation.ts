import { FunctionInputError } from "./function-input-error.js";
import { isRef } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import type { FunctionRefAny } from "./types.js";
import { functionTry, runFunctionSync } from "./function-observability.js";

export {
  copyDependencies,
  copyDependenciesEffect,
  copyPublishes,
  copyPublishesEffect,
} from "./function-dependency-copy.js";

/** Checks a function limit through Effect.
 * @param value - Optional limit.
 * @param name - Fixed limit label.
 * @returns Success or tagged validation failure.
 * @example Effect.runSync(validateLimitEffect(5, "timeoutMs"));
 */
export const validateLimitEffect = Effect.fn("functions.function.validate-limit")(
  (value: number | undefined, name: string) =>
    functionTry("function.validate-limit", () => {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
        throw new FunctionInputError(`${name} must be a positive integer`);
      }
    }),
);

/** Checks a positive integer function limit.
 * @param value - Optional limit.
 * @param name - Limit label.
 * @returns Nothing when valid.
 * @throws TypeError for an invalid limit.
 * @example validateLimit(5, "timeoutMs");
 */
export function validateLimit(value: number | undefined, name: string): void {
  runFunctionSync(validateLimitEffect(value, name));
}

/** Checks an optional hook through Effect.
 * @param value - Candidate hook.
 * @param name - Fixed hook label.
 * @returns Success or tagged validation failure.
 * @example Effect.runSync(assertHookEffect(() => {}, "onBefore"));
 */
export const assertHookEffect = Effect.fn("functions.function.assert-hook")(
  (value: unknown, name: string) =>
    functionTry("function.assert-hook", () => {
      if (value !== undefined && typeof value !== "function") {
        throw new FunctionInputError(`Function ${name} must be a function`);
      }
    }),
);

/** Checks an optional function lifecycle hook.
 * @param value - Candidate hook.
 * @param name - Hook label.
 * @returns Nothing when valid.
 * @throws TypeError when the hook is not callable.
 * @example assertHook(() => {}, "onBefore");
 */
export function assertHook(value: unknown, name: string): void {
  runFunctionSync(assertHookEffect(value, name));
}

/** Checks a function schema through Effect.
 * @param value - Candidate schema.
 * @param name - Schema label.
 * @returns The schema or tagged validation failure.
 * @example Effect.runSync(assertSchemaEffect(z.string(), "input"));
 */
export const assertSchemaEffect = Effect.fn("functions.function.assert-schema")(
  (value: unknown, name: string) =>
    functionTry("function.assert-schema", () => {
      if (!isRecord(value))
        throw new FunctionInputError(`${name} must be a Standard Schema v1 validator`);
      const standard = value["~standard"];
      if (
        !isRecord(standard) ||
        standard.version !== 1 ||
        typeof standard.validate !== "function"
      ) {
        throw new FunctionInputError(`${name} must be a Standard Schema v1 validator`);
      }
      return value as unknown as StandardSchemaV1;
    }),
);

/** Asserts a Standard Schema validator.
 * @param value - Candidate schema.
 * @param name - Schema label.
 * @returns Nothing when valid.
 * @throws TypeError for malformed schemas.
 * @example assertSchema(z.string(), "input");
 */
export function assertSchema(value: unknown, name: string): asserts value is StandardSchemaV1 {
  runFunctionSync(assertSchemaEffect(value, name));
}

/** Resolves a callable receiver through Effect.
 * @param receiver - Optional method receiver.
 * @param fallback - Original function descriptor.
 * @returns Callable function target or tagged validation failure.
 * @example Effect.runSync(functionTargetForReceiverEffect(fn, fn));
 */
export const functionTargetForReceiverEffect = Effect.fn("functions.function.target-for-receiver")(
  (
    receiver: unknown,
    fallback: FunctionRefAny,
  ): Effect.Effect<FunctionRefAny, import("./function-observability.js").FunctionOperationError> =>
    functionTry("function.target-for-receiver", () => {
      if (isRecord(receiver) && receiver.invocationMode === "event-only") {
        throw new FunctionInputError(
          "Event-only functions cannot be invoked or converted to tools",
        );
      }
      if (
        isRecord(receiver) &&
        isRef(receiver.ref, "function") &&
        typeof receiver.handler === "function"
      ) {
        return receiver as unknown as FunctionRefAny;
      }
      return fallback;
    }),
);

/** Resolves a method receiver to a callable function descriptor.
 * @param receiver - Optional method receiver.
 * @param fallback - Original descriptor.
 * @returns Callable function target.
 * @throws TypeError when receiver is event-only.
 * @example functionTargetForReceiver(fn, fn);
 */
export function functionTargetForReceiver(
  receiver: unknown,
  fallback: FunctionRefAny,
): FunctionRefAny {
  return runFunctionSync(functionTargetForReceiverEffect(receiver, fallback));
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
