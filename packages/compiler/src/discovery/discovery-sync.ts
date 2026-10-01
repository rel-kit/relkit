import { Cause, Effect, Exit } from "effect";

/**
 * Executes a synchronous compatibility API while retaining its original errors.
 * @typeParam A - The successful compatibility result.
 * @typeParam E - Expected domain failures thrown by the adapter.
 * @param effect - A synchronous operation requiring no application services.
 * @returns The operation's successful value.
 * @throws The original expected failure or defect when execution fails.
 * @remarks Domain stages compose effects directly; only legacy callers use this edge.
 */
export function runDiscoverySync<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
