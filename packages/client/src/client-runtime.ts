import { Effect, Layer, ManagedRuntime } from "effect";
import { runExecutionPromise, runExecutionSync } from "@relkit/contracts/operation";

/** Resource-free compatibility runner; operation scopes own all native resources. */
const runtime = ManagedRuntime.make(Layer.empty);
runExecutionSync(runtime, Effect.void);

/**
 * Runs fully provided client work at a Promise adapter, retaining original failures.
 * @typeParam A - Public result.
 * @typeParam E - Original domain failure.
 * @param effect - Lazy operation with its dependencies supplied.
 * @param signal - Caller-owned cancellation authority.
 * @returns The original value or rejection, without a FiberFailure wrapper.
 */
export function runClient<A, E>(effect: Effect.Effect<A, E>, signal?: AbortSignal): Promise<A> {
  return runExecutionPromise(runtime, effect, signal === undefined ? undefined : { signal });
}

/**
 * Runs a fully provided synchronous state decision at its compatibility edge.
 * @typeParam A - Synchronous result.
 * @typeParam E - Original domain failure.
 * @param effect - Work that cannot suspend or acquire native resources.
 * @returns The original result synchronously.
 */
export function runClientSync<A, E>(effect: Effect.Effect<A, E>): A {
  return runExecutionSync(runtime, effect);
}
