import { Cause, Effect, Exit, type Context } from "effect";
import type { ManagedRuntime } from "effect";

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

/**
 * Runs a native callback with services captured from its existing scope owner.
 * @typeParam A - Public successful value.
 * @typeParam E - Original domain failure.
 * @typeParam R - Captured service authority.
 * @param context - Existing owner's services; this runner acquires no resource graph.
 * @param effect - Native callback operation, already owned by that lifetime.
 * @param options - Optional caller cancellation.
 * @returns Original result or rejection, preserving public failure identity.
 */
export async function runExecutionPromiseWith<A, E, R>(
  context: Context.Context<R>,
  effect: Effect.Effect<A, E, R>,
  options?: Effect.RunOptions,
): Promise<A> {
  const exit = await Effect.runPromiseExitWith(context)(effect, options);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

/**
 * Runs a synchronous native callback in its captured owner context.
 * @typeParam A - Public successful value.
 * @typeParam E - Original domain failure.
 * @typeParam R - Captured service authority.
 * @param context - Existing owner services; no new lifetime is acquired.
 * @param effect - Synchronously completable operation.
 * @returns Original result; suspension remains a programming error.
 */
export function runExecutionSyncWith<A, E, R>(
  context: Context.Context<R>,
  effect: Effect.Effect<A, E, R>,
): A {
  const exit = Effect.runSyncExitWith(context)(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
