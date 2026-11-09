import { Cause, Context, Data, Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { Deadline as DeadlineValue } from "./deadline.types.js";

/** Deadline timestamp in milliseconds or an absent deadline.
 * @example const deadline: Deadline = Date.now() + 1_000;
 */
export type Deadline = DeadlineValue;

/** Tagged failure for an invalid deadline or timeout.
 * @example Effect.catchTag(composeDeadlineEffect(undefined, -1, 0), "DeadlineValidationError", () => Effect.void);
 */
export class DeadlineValidationError extends Data.TaggedError("DeadlineValidationError")<{
  readonly field: "now" | "deadline" | "timeoutMs";
  readonly message: string;
}> {}

/** The effective deadline inherited by child effects in the current fiber.
 * @example Effect.runSync(Effect.service(Deadline));
 */
export const Deadline = Context.Reference<DeadlineValue | undefined>("relkit/runtime/Deadline", {
  defaultValue: () => undefined,
});

/** Combines inherited and child deadlines in the Effect error channel.
 * @param parentDeadline - Optional inherited absolute deadline.
 * @param timeoutMs - Optional child timeout duration.
 * @param now - Current Unix timestamp in milliseconds.
 * @returns Earliest deadline, or `DeadlineValidationError` for invalid time input.
 * @example Effect.runSync(composeDeadlineEffect(1_000, 100, 950));
 */
export function composeDeadlineEffect(
  parentDeadline: DeadlineValue | undefined,
  timeoutMs: number | undefined,
  now: number,
): Effect.Effect<DeadlineValue | undefined, DeadlineValidationError> {
  return observeInvocation(
    "deadline.compose",
    Effect.gen(function* () {
      yield* validTimestamp(now, "now");
      if (parentDeadline !== undefined) yield* validTimestamp(parentDeadline, "deadline");
      if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 0))
        return yield* Effect.fail(
          new DeadlineValidationError({
            field: "timeoutMs",
            message: "timeoutMs must be a finite non-negative number",
          }),
        );
      const childDeadline = timeoutMs === undefined ? undefined : now + timeoutMs;
      if (childDeadline !== undefined) yield* validTimestamp(childDeadline, "timeoutMs");
      if (parentDeadline === undefined) return childDeadline;
      if (childDeadline === undefined) return parentDeadline;
      return Math.min(parentDeadline, childDeadline);
    }),
  );
}

/** Synchronous deadline compatibility adapter.
 * @param parentDeadline - Optional inherited absolute deadline.
 * @param timeoutMs - Optional child timeout duration.
 * @param now - Current Unix timestamp in milliseconds.
 * @returns Earliest absolute deadline.
 * @throws RangeError when a time input is invalid.
 * @example composeDeadline(1_000, 100, 950);
 */
export function composeDeadline(
  parentDeadline: DeadlineValue | undefined,
  timeoutMs: number | undefined,
  now: number,
): DeadlineValue | undefined {
  try {
    return runInvocationSync(composeDeadlineEffect(parentDeadline, timeoutMs, now));
  } catch (cause) {
    if (cause instanceof DeadlineValidationError) throw new RangeError(cause.message);
    throw cause;
  }
}

/** Runs an effect until an absolute deadline, preserving it for children.
 * @param effect - Child operation to run.
 * @param deadline - Absolute Unix timestamp, if any.
 * @returns Child value, child error, timeout, or `DeadlineValidationError`.
 * @example Effect.runPromise(withDeadline(Effect.succeed(1), Date.now() + 1000));
 */
export function withDeadline<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  deadline: DeadlineValue | undefined,
): Effect.Effect<A, E | Cause.TimeoutError | DeadlineValidationError, R> {
  return observeInvocation(
    "deadline.with",
    Effect.gen(function* () {
      if (deadline === undefined) return yield* effect;
      yield* validTimestamp(deadline, "deadline");
      return yield* Effect.clockWith((clock) => {
        const remaining = deadline - clock.currentTimeMillisUnsafe();
        const timed =
          remaining <= 0
            ? Effect.fail(new Cause.TimeoutError())
            : Effect.timeout(effect, remaining);
        return Effect.provideService(timed, Deadline, deadline);
      });
    }),
  );
}

/** Applies a child timeout while inheriting an earlier fiber deadline.
 * @param effect - Child operation to run.
 * @param timeoutMs - Maximum child duration in milliseconds.
 * @param parentDeadline - Optional explicit parent deadline.
 * @returns Child value, child error, timeout, or `DeadlineValidationError`.
 * @example Effect.runPromise(withTimeout(Effect.succeed(1), 1000));
 */
export function withTimeout<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  timeoutMs: number,
  parentDeadline?: DeadlineValue,
): Effect.Effect<A, E | Cause.TimeoutError | DeadlineValidationError, R> {
  return observeInvocation(
    "deadline.timeout",
    Effect.clockWith((clock) =>
      Effect.gen(function* () {
        const inherited = yield* Effect.service(Deadline);
        const parent = earliest(inherited, parentDeadline);
        const deadline = yield* composeDeadlineEffect(
          parent,
          timeoutMs,
          clock.currentTimeMillisUnsafe(),
        );
        return yield* withDeadline(effect, deadline);
      }),
    ),
  );
}

function earliest(
  first: DeadlineValue | undefined,
  second: DeadlineValue | undefined,
): DeadlineValue | undefined {
  if (first === undefined) return second;
  if (second === undefined) return first;
  return Math.min(first, second);
}

function validTimestamp(
  value: number,
  field: "now" | "deadline" | "timeoutMs",
): Effect.Effect<void, DeadlineValidationError> {
  return Number.isFinite(value)
    ? Effect.void
    : Effect.fail(
        new DeadlineValidationError({ field, message: `${field} must be a finite number` }),
      );
}
