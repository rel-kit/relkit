import { Context, Data, Deferred, Effect, Exit, Layer, Option, Scope } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import type { AbortBridge, AbortBridgeEffectHandle, AbortIOService } from "./abort.types.js";

export type { AbortBridge, AbortBridgeEffectHandle, AbortIOService } from "./abort.types.js";

/** Tagged abort or Promise operation failure.
 * @example Effect.catchTag(abortablePromiseEffect(signal, work), "AbortOperationFailure", () => Effect.void);
 */
export class AbortOperationFailure extends Data.TaggedError("AbortOperationFailure")<{
  readonly kind: "aborted" | "operation";
  readonly cause: unknown;
  readonly message: string;
}> {}

/** Substitutable AbortController and listener boundary.
 * @example Effect.provide(createAbortBridgeEffect(signal), AbortIOLive);
 */
export class AbortIO extends Context.Service<AbortIO, AbortIOService>()(
  "relkit/invocation/AbortIO",
) {}

const liveIO: AbortIOService = {
  createController: () => new AbortController(),
  listen: (signal, onAbort) => {
    signal.addEventListener("abort", onAbort, { once: true });
    return () => signal.removeEventListener("abort", onAbort);
  },
};

/** Live AbortController and listener operations.
 * @example Effect.runSync(Effect.provide(createAbortBridgeEffect(signal), AbortIOLive));
 */
export const AbortIOLive = Layer.succeed(AbortIO, liveIO);

/** Links a fiber signal with an optional parent through Effect.
 * @param fiberSignal - Runtime fiber abort signal.
 * @param parentSignal - Optional inherited abort signal.
 * @returns A linked signal and Effect cleanup; no expected failure.
 * @example Effect.runSync(createAbortBridgeEffect(fiberSignal, parentSignal));
 */
export function createAbortBridgeEffect(
  fiberSignal: AbortSignal,
  parentSignal?: AbortSignal,
): Effect.Effect<AbortBridgeEffectHandle> {
  return observeInvocation(
    "abort.bridge-create",
    Effect.flatMap(Effect.serviceOption(AbortIO), (provided) =>
      Effect.gen(function* () {
        const io = Option.isSome(provided) ? provided.value : liveIO;
        const controller = yield* Effect.sync(() => io.createController());
        const scope = yield* Scope.make();
        const abortFrom = (source: AbortSignal): void => {
          if (!controller.signal.aborted) controller.abort(source.reason);
        };
        const register = (source: AbortSignal): Effect.Effect<void, never, Scope.Scope> =>
          Effect.asVoid(
            Effect.acquireRelease(
              Effect.sync(() => io.listen(source, () => abortFrom(source))),
              (remove) => Effect.sync(remove),
            ),
          );
        yield* Scope.provide(
          Effect.gen(function* () {
            const preAborted =
              parentSignal?.aborted === true
                ? parentSignal
                : fiberSignal.aborted
                  ? fiberSignal
                  : undefined;
            if (preAborted !== undefined) {
              abortFrom(preAborted);
              return;
            }
            yield* register(fiberSignal);
            if (parentSignal !== undefined && parentSignal !== fiberSignal)
              yield* register(parentSignal);
            const racedAbort =
              parentSignal?.aborted === true
                ? parentSignal
                : fiberSignal.aborted
                  ? fiberSignal
                  : undefined;
            if (racedAbort !== undefined) abortFrom(racedAbort);
          }).pipe(Effect.onError(() => Scope.close(scope, Exit.succeed(undefined)))),
          scope,
        );
        const disposeEffect = (): Effect.Effect<void> =>
          observeInvocation("abort.dispose", Scope.close(scope, Exit.succeed(undefined)));
        return {
          signal: controller.signal,
          dispose: () => runInvocationSync(disposeEffect()),
          disposeEffect,
        };
      }),
    ),
  );
}

/** Public linked signal compatibility adapter.
 * @param fiberSignal - Runtime fiber abort signal.
 * @param parentSignal - Optional inherited abort signal.
 * @returns A linked signal and idempotent cleanup.
 * @throws A defect if AbortController or listener registration fails.
 * @example createAbortBridge(new AbortController().signal);
 */
export function createAbortBridge(
  fiberSignal: AbortSignal,
  parentSignal?: AbortSignal,
): AbortBridge {
  return runInvocationSync(createAbortBridgeEffect(fiberSignal, parentSignal));
}

/** Runs a Promise operation with prompt abort and typed failure.
 * @param signal - Abort signal passed to the operation.
 * @param operation - Promise operation to run.
 * @returns Its value or AbortOperationFailure with the original cause.
 * @example Effect.runPromise(abortablePromiseEffect(signal, async () => 1));
 */
export function abortablePromiseEffect<A>(
  signal: AbortSignal,
  operation: (signal: AbortSignal) => PromiseLike<A>,
): Effect.Effect<A, AbortOperationFailure> {
  return observeInvocation(
    "abort.promise",
    Effect.flatMap(Effect.serviceOption(AbortIO), (provided) =>
      Effect.gen(function* () {
        const io = Option.isSome(provided) ? provided.value : liveIO;
        if (signal.aborted) return yield* Effect.fail(aborted(signal));
        const stopped = yield* Deferred.make<never, AbortOperationFailure>();
        const onAbort = (): void => {
          // EventTarget callbacks need to complete the Effect gate synchronously.
          Deferred.doneUnsafe(stopped, Effect.fail(aborted(signal)));
        };
        return yield* Effect.acquireUseRelease(
          Effect.sync(() => io.listen(signal, onAbort)),
          () =>
            Effect.gen(function* () {
              if (signal.aborted) return yield* Effect.fail(aborted(signal));
              return yield* Effect.raceFirst(
                Effect.gen(function* () {
                  // Preserve the same-turn chance to abort before starting work.
                  yield* Effect.yieldNow;
                  return yield* Effect.tryPromise({
                    try: () => operation(signal),
                    catch: (cause) =>
                      new AbortOperationFailure({
                        kind: "operation",
                        cause,
                        message: "Promise operation failed",
                      }),
                  });
                }),
                Deferred.await(stopped),
              );
            }),
          (remove) => Effect.sync(remove),
        );
      }),
    ),
  );
}

/** Public Promise abort compatibility adapter.
 * @param signal - Abort signal passed to the operation.
 * @param operation - Promise operation to run.
 * @returns Its resolved value.
 * @throws The original abort reason or operation failure.
 * @example await abortablePromise(signal, async () => 1);
 */
export async function abortablePromise<A>(
  signal: AbortSignal,
  operation: (signal: AbortSignal) => PromiseLike<A>,
): Promise<A> {
  try {
    return await Effect.runPromise(abortablePromiseEffect(signal, operation));
  } catch (cause) {
    if (cause instanceof AbortOperationFailure) throw cause.cause;
    throw cause;
  }
}

function aborted(signal: AbortSignal): AbortOperationFailure {
  return new AbortOperationFailure({
    kind: "aborted",
    cause: signal.reason ?? new Error("Operation aborted"),
    message: "Operation aborted",
  });
}
