import { Data, Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { DeadlineOptions, InvocationParent } from "./standalone-deadline.types.js";

/** Tagged invalid timeout or absolute deadline in a standalone dispatch.
 * @example Effect.catchTag(calculateStandaloneDeadlineEffect(-1, {}, undefined, 0), "StandaloneDeadlineError", () => Effect.void);
 */
export class StandaloneDeadlineError extends Data.TaggedError("StandaloneDeadlineError")<{
  readonly field: "timeoutMs" | "deadline";
  readonly message: string;
}> {}

/** Chooses the earliest parent, option, or target deadline through Effect.
 * @param targetTimeout - Target timeout in milliseconds.
 * @param options - Dispatch timeout and deadline overrides.
 * @param parent - Optional inherited invocation deadline.
 * @param now - Current Unix timestamp in milliseconds.
 * @returns Earliest absolute deadline, or `StandaloneDeadlineError`.
 * @example Effect.runSync(calculateStandaloneDeadlineEffect(100, {}, undefined, 0));
 */
export function calculateStandaloneDeadlineEffect(
  targetTimeout: number | undefined,
  options: DeadlineOptions,
  parent: InvocationParent | undefined,
  now: number,
): Effect.Effect<number | undefined, StandaloneDeadlineError> {
  return observeInvocation(
    "standalone.deadline",
    Effect.gen(function* () {
      const timeouts = [targetTimeout, options.timeoutMs].filter(
        (value): value is number => value !== undefined,
      );
      for (const timeout of timeouts) {
        if (!Number.isFinite(timeout) || timeout < 0)
          return yield* Effect.fail(
            new StandaloneDeadlineError({
              field: "timeoutMs",
              message: "timeoutMs must be finite and non-negative",
            }),
          );
      }
      const deadlines = [parent?.deadlineMs, options.deadlineMs];
      if (timeouts.length > 0) deadlines.push(now + Math.min(...timeouts));
      for (const deadline of deadlines) {
        if (deadline !== undefined && !Number.isFinite(deadline))
          return yield* Effect.fail(
            new StandaloneDeadlineError({
              field: "deadline",
              message: "deadline must be a finite timestamp",
            }),
          );
      }
      return deadlines
        .filter((value): value is number => value !== undefined)
        .reduce<number | undefined>(
          (minimum, value) => (minimum === undefined ? value : Math.min(minimum, value)),
          undefined,
        );
    }),
  );
}

/** Synchronous standalone deadline compatibility adapter.
 * @param targetTimeout - Target timeout in milliseconds.
 * @param options - Dispatch timeout and deadline overrides.
 * @param parent - Optional inherited invocation deadline.
 * @param now - Current Unix timestamp in milliseconds.
 * @returns Earliest absolute deadline.
 * @throws RangeError for invalid timeout or deadline values.
 * @example calculateStandaloneDeadline(100, {}, undefined, 0);
 */
export function calculateStandaloneDeadline(
  targetTimeout: number | undefined,
  options: DeadlineOptions,
  parent: InvocationParent | undefined,
  now: number,
): number | undefined {
  try {
    return runInvocationSync(
      calculateStandaloneDeadlineEffect(targetTimeout, options, parent, now),
    );
  } catch (cause) {
    if (cause instanceof StandaloneDeadlineError) throw new RangeError(cause.message);
    throw cause;
  }
}
