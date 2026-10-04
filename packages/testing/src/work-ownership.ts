import { Cause, Context, Deferred, Effect, Exit, Fiber, Scope } from "effect";
import type { OwnedCloseOperation, WorkOwnershipState } from "./work-ownership.types.js";
import { observeExecution } from "@relkit/contracts/operation";

/**
 * Runs a native facade callback in its already acquired observation context.
 * @typeParam A Native result retained by the facade.
 * @param context Context captured once by the owning service.
 * @param effect Domain workflow; no runtime is acquired by this native bridge.
 * @returns The result or original typed/native failure value.
 */
export async function runOwnedContext<A>(
  context: Context.Context<never>,
  effect: Effect.Effect<A, unknown>,
): Promise<A> {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, context));
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
  return exit.value;
}

/**
 * Registers scoped work before restoring caller interruption at its join boundary.
 * @typeParam A Native workflow result.
 * @param state Owner admission and real completion receipts.
 * @param scope Service scope owning work after an interrupted caller stops waiting.
 * @param context Acquired service context reused by native completion receipts.
 * @param work Effect workflow containing the actual ordered domain decisions.
 * @returns The workflow result; close/restart retain its completion independently.
 */
export function admitOwnedWork<A>(
  state: WorkOwnershipState,
  scope: Scope.Scope,
  context: Context.Context<never>,
  work: Effect.Effect<A, unknown>,
): Effect.Effect<A, unknown> {
  return Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      if (state.closed)
        return yield* Effect.fail(new Error(`Test ${state.kind ?? "harness"} is closed`));
      if (state.restarting !== undefined)
        return yield* Effect.fail(new Error(`Test ${state.kind ?? "harness"} is restarting`));
      const fiber = yield* Effect.forkIn(work, scope, { uninterruptible: false });
      const receipt = runOwnedContext(context, Fiber.join(fiber));
      state.pending.add(receipt);
      void receipt.finally(() => state.pending.delete(receipt)).catch(() => undefined);
      return yield* restore(Fiber.join(fiber));
    }),
  );
}

/**
 * Joins every actual completion while retaining failed operations as settled work.
 * @param pending Admitted completion receipts captured before stopping admission.
 * @returns Completion after every receipt settles, including failures.
 */
export const joinOwnedWork = Effect.fn("Testing.owner.join")(function* (
  pending: Iterable<Promise<unknown>>,
) {
  yield* Effect.forEach(
    [...pending],
    (receipt) =>
      Effect.exit(
        Effect.tryPromise({
          try: () => receipt,
          catch: (cause) => cause,
        }),
      ),
    { concurrency: "unbounded", discard: true },
  );
});

/**
 * Owns restart and close ordering without replacing native persistence authorities.
 * @param state Admission, abort authority and completion receipts.
 * @param scope Scope owning a restart after its caller stops waiting.
 * @param context Acquired observation context for completion receipts.
 * @param release Effect releasing the current native generation.
 * @param acquire Effect acquiring the next generation after release completes.
 * @param cleanup Effect cleaning temporary ownership after the final release attempt.
 * @param closeOperation Fixed owner label observed only when final release is claimed.
 * @returns Effect controls; admission closes before any asynchronous join begins.
 */
export function ownedLifecycle(
  state: WorkOwnershipState,
  scope: Scope.Scope,
  context: Context.Context<never>,
  release: Effect.Effect<void, unknown>,
  acquire: Effect.Effect<void, unknown>,
  cleanup: (failed: boolean) => Effect.Effect<void>,
  closeOperation: OwnedCloseOperation,
) {
  const restart = Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      if (state.closed)
        return yield* Effect.fail(new Error(`Test ${state.kind ?? "harness"} is closed`));
      if (state.restarting !== undefined)
        return yield* restore(
          Effect.tryPromise({
            try: () => state.restarting!,
            catch: (cause) => cause,
          }),
        );
      const done = yield* Deferred.make<void, unknown>();
      state.restarting = runOwnedContext(context, Deferred.await(done));
      void state.restarting.catch(() => undefined);
      state.controller.abort(new Error(`Test ${state.kind ?? "harness"} restarted`));
      yield* Effect.forkIn(
        Effect.gen(function* () {
          yield* joinOwnedWork(state.pending);
          yield* release;
          if (!state.closed) {
            state.controller = new AbortController();
            yield* acquire;
          }
        }).pipe(
          Effect.onExit((exit) =>
            Effect.gen(function* () {
              delete state.restarting;
              yield* Deferred.done(done, exit);
            }),
          ),
        ),
        scope,
        { uninterruptible: false },
      );
      return yield* restore(Deferred.await(done));
    }),
  );
  return {
    restart,
    close: (failed = false) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          if (state.closing !== undefined)
            return yield* Effect.tryPromise({
              try: () => state.closing!,
              catch: (cause) => cause,
            });
          const done = yield* Deferred.make<void, unknown>();
          state.closing = runOwnedContext(context, Deferred.await(done));
          void state.closing.catch(() => undefined);
          state.closed = true;
          state.controller.abort(new Error(`Test ${state.kind ?? "harness"} is closed`));
          return yield* observeExecution(
            "testing",
            closeOperation,
            Effect.gen(function* () {
              yield* joinOwnedWork([
                ...state.pending,
                ...(state.restarting === undefined ? [] : [state.restarting]),
              ]);
              const released = yield* Effect.exit(release);
              yield* cleanup(failed || Exit.isFailure(released));
              if (Exit.isFailure(released)) return yield* Effect.failCause(released.cause);
            }),
          ).pipe(Effect.onExit((exit) => Deferred.done(done, exit)));
        }),
      ),
  };
}
