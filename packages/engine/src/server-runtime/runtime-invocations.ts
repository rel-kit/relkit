/**
 * Tracks original native task identities until physical settlement, independently
 * of cancelled waiters, and settles bounded batch siblings before failing.
 */
import { Effect, Exit, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { ServerRuntimeFailure } from "./server-runtime.schemas.js";
import type { RuntimeServiceState } from "./runtime-service-state.types.js";

/** @typeParam A - Original native result. @param owner - Generation receipt owner. @param task - Already-started native Promise. @returns Interruptible result wait while an owned receipt follows actual settlement. */
export const trackRuntimeInvocation = Effect.fn("ServerRuntime.track")(
  function* <A>(owner: RuntimeServiceState, task: Promise<A>) {
    yield* Effect.gen(function* () {
      yield* Ref.update(owner.active, (current) => new Set([...current, task]));
      // Retain the original task identity; this receipt outlives an interrupted waiter.
      yield* Effect.promise(() =>
        task.then(
          () => undefined,
          () => undefined,
        ),
      ).pipe(
        Effect.ensuring(
          Ref.update(
            owner.active,
            (current) => new Set([...current].filter((entry) => entry !== task)),
          ),
        ),
        Effect.forkIn(owner.owner),
      );
    }).pipe(Effect.uninterruptible);
    return yield* Effect.tryPromise({
      try: () => task,
      catch: (cause) => new ServerRuntimeFailure({ operation: "invocation", cause }),
    });
  },
  (effect) => observeExecution("runtime", "server.invocation", effect),
);

/** @typeParam A - Batch input. @param owner - Shared generation admission state. @param values - Independent inputs. @param task - Fully provided callback effect. @returns All siblings settled, retaining the first observed failed Exit. */
export const eachRuntimeInvocation = Effect.fn("ServerRuntime.each")(
  function* <A>(
    owner: RuntimeServiceState,
    values: readonly A[],
    task: (value: A) => Effect.Effect<void, ServerRuntimeFailure>,
  ) {
    const first = yield* Ref.make<Exit.Exit<void, ServerRuntimeFailure> | undefined>(undefined);
    yield* Effect.forEach(
      values,
      (value) =>
        Effect.gen(function* () {
          const result = yield* Effect.exit(
            Effect.gen(function* () {
              if ((yield* Ref.get(owner.state)).stopping)
                return yield* Effect.fail(
                  new ServerRuntimeFailure({
                    operation: "batch",
                    cause: new Error("Runtime is stopping."),
                  }),
                );
              yield* task(value);
            }),
          );
          if (Exit.isFailure(result)) yield* Ref.update(first, (current) => current ?? result);
        }),
      { concurrency: 16, discard: true },
    );
    const failure = yield* Ref.get(first);
    if (failure !== undefined && Exit.isFailure(failure))
      return yield* Effect.failCause(failure.cause);
  },
  (effect, _owner, values) =>
    observeExecution("runtime", "server.batch", effect, () => ({ entries: values.length })),
);
