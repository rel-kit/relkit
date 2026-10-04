import { Effect, Schema, type ManagedRuntime } from "effect";
import { runExecutionPromise, runExecutionSync } from "@relkit/contracts/operation";
import type { MaybePromise } from "@relkit/contracts";

/** Typed native/validation boundary failure retaining the exact compatibility cause. */
export class InspectorBoundaryError extends Schema.TaggedError<InspectorBoundaryError>()(
  "InspectorBoundaryError",
  {
    kind: Schema.Literals(["native", "projection"]),
    cause: Schema.Defect(),
  },
) {}

/**
 * Admits one synchronous or Promise native call into a typed Effect failure channel.
 * @typeParam A - Native successful result.
 * @param call - Lazy native call; cancellation signals remain explicit in its arguments.
 * @returns A lazy interruptible wait preserving the native error object.
 * @remarks Interruption releases the waiter. The external call only cancels when
 * its own AbortSignal contract supports cancellation; no retry is implied.
 */
export function nativeAttempt<A>(
  call: () => MaybePromise<A>,
): Effect.Effect<A, InspectorBoundaryError> {
  return Effect.tryPromise({
    try: () => Promise.resolve(call()),
    catch: (cause) => new InspectorBoundaryError({ kind: "native", cause }),
  });
}

/**
 * Captures expected projection or validation exceptions without traversing private fields.
 * @typeParam A - Projected successful result.
 * @param project - Lazy selective projection or validation.
 * @returns The result or its original error in the typed failure channel.
 */
export function projectionAttempt<A>(project: () => A): Effect.Effect<A, InspectorBoundaryError> {
  return Effect.try({
    try: project,
    catch: (cause) => new InspectorBoundaryError({ kind: "projection", cause }),
  });
}

/**
 * Restores a native compatibility error without changing defects or interruption.
 * @param error - Typed boundary carrier or public domain error.
 * @returns The original native error object when carried, otherwise the same value.
 */
export function unwrapInspectorFailure(error: unknown): unknown {
  return error instanceof InspectorBoundaryError ? error.cause : error;
}

/**
 * Executes a Promise compatibility edge on a reused owner, restoring native errors.
 * @typeParam A - Successful result.
 * @typeParam E - Typed domain failure.
 * @typeParam R - Required owner services.
 * @typeParam ER - Owner acquisition failure.
 * @param owner - Reused service runtime.
 * @param effect - Lazy domain operation; observation stays inside that operation.
 * @returns The unchanged result or original native/public failure.
 */
export function runInspectorPromise<A, E, R, ER>(
  owner: ManagedRuntime.ManagedRuntime<R, ER>,
  effect: Effect.Effect<A, E, R>,
): Promise<A> {
  return runExecutionPromise(owner, effect.pipe(Effect.mapError(unwrapInspectorFailure)));
}

/**
 * Executes a synchronous compatibility edge and restores native validation errors.
 * @typeParam A - Successful result.
 * @typeParam E - Typed domain failure.
 * @typeParam R - Required owner services.
 * @typeParam ER - Owner acquisition failure.
 * @param owner - Reused service runtime supporting synchronous acquisition.
 * @param effect - Lazy synchronous domain operation.
 * @returns The unchanged result; failures throw their original compatibility object.
 */
export function runInspectorSync<A, E, R, ER>(
  owner: ManagedRuntime.ManagedRuntime<R, ER>,
  effect: Effect.Effect<A, E, R>,
): A {
  return runExecutionSync(owner, effect.pipe(Effect.mapError(unwrapInspectorFailure)));
}
