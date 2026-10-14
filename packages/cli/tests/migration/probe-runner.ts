/**
 * Owns the native argv/signal boundary for finite layout acceptance probes.
 * The probe's Effect owns temporary fixtures; this adapter awaits finalization
 * and removes native signal listeners before returning to the parent process.
 */
import { Effect } from "effect";

/**
 * Runs a probe with native cancellation while preserving all failure channels.
 * @typeParam Value - Successful assertion result, unused by the executable edge.
 * @typeParam Failure - Expected fixture/I/O failure retained by the runtime.
 * @param program - Finite probe whose scopes own every temporary source tree.
 * @returns Native completion after assertions and owned cleanup settle.
 */
export async function runLayoutProbe<Value, Failure>(
  program: Effect.Effect<Value, Failure>,
): Promise<void> {
  const controller = new AbortController();
  const interrupt = (): void => controller.abort();
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    await Effect.runPromise(program, { signal: controller.signal });
    process.stdout.write("layout probe passed\n");
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}
