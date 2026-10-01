import { Cause, Effect, Exit } from "effect";
import { runCompilerSync } from "../compatibility.js";

/**
 * Executes a synchronous legacy edge while retaining original failures and defects.
 * @typeParam A - Successful legacy result.
 * @typeParam E - Expected failure thrown at this edge.
 * @param effect - Fully provided synchronous domain operation.
 * @returns The successful operation result.
 * @throws The original expected failure or defect; graph rejections retain their legacy TypeError shape.
 * @remarks Domain stages compose effects directly; this adapter belongs only at legacy call sites.
 */
export function runJobsSync<A, E>(effect: Effect.Effect<A, E>): A {
  return runCompilerSync(effect);
}

/**
 * Executes a legacy Promise edge without wrapping its rejection reason.
 * @typeParam A - Successful legacy result.
 * @typeParam E - Expected domain failure rejected at this edge.
 * @param effect - Fully provided domain operation, including its resource finalizers.
 * @returns A Promise resolving to the result or rejecting with the original failure or defect.
 * @remarks Resolution waits for finalizers. Effect consumers retain interruption through direct composition.
 */
export async function runJobsPromise<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
