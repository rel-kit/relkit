import { Cause, Effect, Exit } from "effect";
import { GraphCanonicalizationError } from "@relkit/graph";
import { OpenApiGenerationError } from "@relkit/openapi";

/**
 * Executes a fully provided synchronous operation at a legacy compiler boundary.
 * @typeParam A - Successful result.
 * @typeParam E - Expected failure thrown by the adapter.
 * @param effect - Lazy synchronous compiler operation.
 * @returns Its successful value.
 * @throws The original failure or defect. Graph, OpenAPI, and missing client target rejections retain their legacy TypeError shape.
 */
export function runCompilerSync<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.squash(exit.cause);
  if (
    Cause.hasFails(exit.cause) &&
    (error instanceof GraphCanonicalizationError || error instanceof OpenApiGenerationError)
  ) {
    throw new TypeError(error.message);
  }
  if (
    Cause.hasFails(exit.cause) &&
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "MissingRouteTarget" &&
    "triggerId" in error &&
    "targetFunctionId" in error
  ) {
    throw new TypeError(
      `HTTP trigger "${error.triggerId}" targets missing function "${error.targetFunctionId}".`,
    );
  }
  throw error;
}

/**
 * Executes a fully provided operation at a legacy Promise boundary.
 * @typeParam A - Successful result.
 * @typeParam E - Expected rejection.
 * @param effect - Lazy compiler operation, including resource finalizers.
 * @returns A Promise settling after cleanup, retaining original rejection values.
 */
export async function runCompilerPromise<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
