import { Cause, Exit } from "effect";
import type { Effect, ManagedRuntime } from "effect";

/**
 * Runs a synchronous compatibility edge in its existing service owner.
 * @typeParam A - Successful public result.
 * @typeParam E - Domain failure whose object identity is retained.
 * @typeParam R - Services supplied by the owning runtime.
 * @typeParam ER - Acquisition failure from the owner's Layer.
 * @param runtime - Reused owner; never construct a runtime for each call.
 * @param effect - Synchronously completable domain operation.
 * @returns The successful value without a Promise boundary.
 * @throws The original typed failure or defect; suspension is a programming error.
 * @example
 * ```ts
 * import { Effect, Layer, ManagedRuntime } from "effect";
 * import { runExecutionSync } from "@relkit/contracts/operation";
 * const owner = ManagedRuntime.make(Layer.empty);
 * try {
 *   const value = runExecutionSync(owner, Effect.succeed(1));
 * } finally {
 *   await owner.dispose();
 * }
 * ```
 */
export function runExecutionSync<A, E, R, ER>(
  runtime: ManagedRuntime.ManagedRuntime<R, ER>,
  effect: Effect.Effect<A, E, R>,
): A {
  const exit = runtime.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

/**
 * Runs a Promise compatibility edge without exposing Effect's FiberFailure wrapper.
 * @typeParam A - Successful public result.
 * @typeParam E - Domain failure whose object identity is retained.
 * @typeParam R - Services supplied by the owning runtime.
 * @typeParam ER - Acquisition failure from the owner's Layer.
 * @param runtime - Reused service owner responsible for eventual disposal.
 * @param effect - Domain operation; native I/O must consume its cancellation signal.
 * @param options - Caller cancellation and run options; the caller's controller stays owned by it.
 * @returns The original result or rejection object.
 * @example
 * ```ts
 * import { Effect, Layer, ManagedRuntime } from "effect";
 * import { runExecutionPromise } from "@relkit/contracts/operation";
 * const owner = ManagedRuntime.make(Layer.empty);
 * try {
 *   const value = await runExecutionPromise(owner, Effect.succeed(1));
 * } finally {
 *   await owner.dispose();
 * }
 * ```
 */
export async function runExecutionPromise<A, E, R, ER>(
  runtime: ManagedRuntime.ManagedRuntime<R, ER>,
  effect: Effect.Effect<A, E, R>,
  options?: Effect.RunOptions,
): Promise<A> {
  const exit = await runtime.runPromiseExit(effect, options);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
