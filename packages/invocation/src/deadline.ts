import { Cause, Context, Effect } from "effect";

/** An absolute Unix timestamp in milliseconds. */
export type Deadline = number;

/** The effective deadline inherited by child effects in the current fiber. */
export const Deadline = Context.Reference<Deadline | undefined>("relkit/runtime/Deadline", {
  defaultValue: () => undefined,
});

/** Combines a parent deadline with a child timeout using the earliest instant. */
export function composeDeadline(
  parentDeadline: Deadline | undefined,
  timeoutMs: number | undefined,
  now: number,
): Deadline | undefined {
  assertTimestamp(now, "now");
  assertDeadline(parentDeadline);
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 0)) {
    throw new RangeError("timeoutMs must be a finite non-negative number");
  }
  const childDeadline = timeoutMs === undefined ? undefined : now + timeoutMs;
  if (childDeadline !== undefined) assertTimestamp(childDeadline, "timeoutMs");
  if (parentDeadline === undefined) return childDeadline;
  if (childDeadline === undefined) return parentDeadline;
  return Math.min(parentDeadline, childDeadline);
}

/** Runs an effect until an absolute deadline, preserving the deadline for children. */
export function withDeadline<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  deadline: Deadline | undefined,
): Effect.Effect<A, E | Cause.TimeoutError, R> {
  if (deadline === undefined) return effect;
  assertDeadline(deadline);
  return Effect.clockWith((clock) => {
    const remaining = deadline - clock.currentTimeMillisUnsafe();
    const timed =
      remaining <= 0 ? Effect.fail(new Cause.TimeoutError()) : Effect.timeout(effect, remaining);
    return Effect.provideService(timed, Deadline, deadline);
  });
}

/** Applies a child timeout while inheriting an earlier deadline from the fiber. */
export function withTimeout<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  timeoutMs: number,
  parentDeadline?: Deadline,
): Effect.Effect<A, E | Cause.TimeoutError, R> {
  return Effect.clockWith((clock) =>
    Effect.gen(function* () {
      const inherited = yield* Effect.service(Deadline);
      const parent = earliest(inherited, parentDeadline);
      const deadline = composeDeadline(parent, timeoutMs, clock.currentTimeMillisUnsafe());
      return yield* withDeadline(effect, deadline);
    }),
  );
}

function earliest(first: Deadline | undefined, second: Deadline | undefined): Deadline | undefined {
  if (first === undefined) return second;
  if (second === undefined) return first;
  return Math.min(first, second);
}

function assertDeadline(value: Deadline | undefined): void {
  if (value !== undefined) assertTimestamp(value, "deadline");
}

function assertTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`);
}
