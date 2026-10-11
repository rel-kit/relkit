/**
 * Runs the benchmark at its native executable boundary. Termination interrupts
 * the root Effect rather than exiting the host immediately, allowing measurement
 * Scopes to reap detached command groups before listener ownership is released.
 */
import { Effect } from "effect";

/**
 * Owns executable signals until the supplied Effect and its finalizers settle.
 * @typeParam A - Successful executable result.
 * @typeParam E - Original benchmark failure contract, retained without translation.
 * @param program - Fully provided benchmark program; its resource Scopes own children.
 * @returns Physical completion after interruption and every scoped finalizer.
 */
export async function runBenchmarkMain<A, E>(program: Effect.Effect<A, E>): Promise<A> {
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error("Benchmark invocation interrupted"));
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    return await Effect.runPromise(program, { signal: controller.signal });
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}
