import { Data, Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import { DescriptorIdentityFailure } from "./identity-state.js";
import type { InvocationCallFrame } from "./recursion.types.js";

/** Public recursion policy denial with the repeated function and cycle.
 * @example throw new RecursionPolicyError("tasks.run", ["tasks.run"], ["tasks.run", "tasks.run"]);
 */
export class RecursionPolicyError extends Error {
  readonly code = "RELKIT_RECURSION_DENIED" as const;
  readonly functionId: string;
  readonly callStack: readonly string[];
  readonly cycle: readonly string[];

  constructor(functionId: string, callStack: readonly string[], cycle: readonly string[]) {
    super("Invocation denied by recursion policy");
    this.name = "RecursionPolicyError";
    this.functionId = functionId;
    this.callStack = Object.freeze([...callStack]);
    this.cycle = Object.freeze([...cycle]);
  }
}

/** Tagged recursion or frame validation failure.
 * @example Effect.catchTag(stack.enterEffect("tasks.run"), "RecursionFailure", () => Effect.void);
 */
export class RecursionFailure extends Data.TaggedError("RecursionFailure")<{
  readonly cause: RecursionPolicyError | TypeError;
  readonly message: string;
}> {}

/** Runs immutable stack logic with a tagged expected failure.
 * @param operation - Fixed operation name.
 * @param body - Stack calculation.
 * @returns The calculated value or `RecursionFailure`; unexpected errors remain defects.
 * @example recursionOperation("recursion.has", () => true);
 */
export function recursionOperation<A>(
  operation: "recursion.create" | "recursion.ids" | "recursion.has" | "recursion.enter",
  body: () => A,
): Effect.Effect<A, RecursionFailure> {
  return observeInvocation(
    operation,
    Effect.suspend(() => {
      try {
        return Effect.succeed(body());
      } catch (cause) {
        if (cause instanceof RecursionPolicyError || cause instanceof TypeError)
          return Effect.fail(new RecursionFailure({ cause, message: cause.message }));
        return Effect.die(cause);
      }
    }),
  );
}

/** Runs a recursion Effect as a synchronous compatibility operation.
 * @param effect - Stack operation.
 * @returns Its successful value.
 * @throws RecursionPolicyError, TypeError, or an identity error.
 * @example runRecursionSync(stack.enterEffect("tasks.run"));
 */
export function runRecursionSync<A>(
  effect: Effect.Effect<A, RecursionFailure | DescriptorIdentityFailure>,
): A {
  try {
    return runInvocationSync(effect);
  } catch (cause) {
    if (cause instanceof RecursionFailure || cause instanceof DescriptorIdentityFailure)
      throw cause.cause;
    throw cause;
  }
}

/** Freezes a validated frame inside an observed stack operation.
 * @param frame - Candidate call frame.
 * @returns Frozen frame.
 * @throws TypeError when its function ID is invalid.
 * @example freezeFrame({ functionId: "tasks.run" });
 */
export function freezeFrame(frame: InvocationCallFrame): InvocationCallFrame {
  validateFunctionId(frame.functionId);
  return Object.freeze({
    functionId: frame.functionId,
    ...(frame.invocationId === undefined ? {} : { invocationId: frame.invocationId }),
  });
}

/** Validates a function ID inside an observed stack operation.
 * @param functionId - Candidate ID.
 * @returns Void when valid.
 * @throws TypeError for a missing ID.
 * @example validateFunctionId("tasks.run");
 */
export function validateFunctionId(functionId: string): void {
  if (typeof functionId !== "string" || functionId.trim().length === 0)
    throw new TypeError("functionId must be a non-empty string");
}

/** Narrows an object to a frame when it carries a function ID.
 * @param value - Candidate object.
 * @returns True when it has a function ID property.
 * @example isFrame({ functionId: "tasks.run" });
 */
export function isFrame(value: object): value is InvocationCallFrame {
  return "functionId" in value;
}
