import { Effect } from "effect";

/**
 * Couples an explicit caller signal to the existing owning fiber without another runner.
 * @typeParam A - Original success result.
 * @typeParam E - Original typed failures.
 * @typeParam R - Explicit service requirements.
 * @param effect - Lazy operation with owned finalizers/physical receipts.
 * @param signal - Optional explicit caller cancellation.
 * @returns The original operation, interrupted on cancellation and joined through cleanup.
 */
export function withJobsSignal<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  signal?: AbortSignal,
): Effect.Effect<A, E, R> {
  if (signal === undefined) return effect;
  const cancelled = Effect.callback<never>((resume) => {
    const abort = () => resume(Effect.interrupt);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    return Effect.sync(() => signal.removeEventListener("abort", abort));
  });
  return Effect.raceFirst(effect, cancelled);
}
