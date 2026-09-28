import { AsyncLocalStorage } from "node:async_hooks";
import { Context, Effect, Layer, Option, Result } from "effect";
import type { RealtimeDispatcher } from "./dispatch.types.js";
import { RealtimeActionError, RealtimeDispatcherError } from "./realtime-errors.js";
import { observeRealtime } from "./realtime-observability.js";
export type * from "./dispatch.types.js";
const dispatchScope = new AsyncLocalStorage<RealtimeDispatcher>();
let activeDispatcher: RealtimeDispatcher | undefined;
/** Injectable dispatcher for Effect-native channel operations.
 * @example Effect.provide(currentRealtimeDispatcherEffect(), RealtimeDispatcherLive);
 */
export class RealtimeDispatcherService extends Context.Service<
  RealtimeDispatcherService,
  RealtimeDispatcher
>()("relkit/realtime/RealtimeDispatcher") {}
/** Resolves the currently bound dispatcher when an Effect requests it.
 * @example Effect.provide(currentRealtimeDispatcherEffect(), RealtimeDispatcherLive);
 */
export const RealtimeDispatcherLive = Layer.effect(
  RealtimeDispatcherService,
  Effect.gen(function* () {
    return yield* currentRealtimeDispatcherEffect();
  }),
);
/** Changes the fallback dispatcher in the Effect path.
 * @param dispatcher - Dispatcher or undefined to clear the fallback.
 * @returns An Effect of void without a typed failure.
 * @example Effect.runSync(setActiveRealtimeDispatcherEffect(dispatcher));
 */
export const setActiveRealtimeDispatcherEffect = Effect.fn("Realtime.setActiveDispatcher")(
  function* (dispatcher: RealtimeDispatcher | undefined) {
    activeDispatcher = dispatcher;
  },
  (effect) => observeRealtime("dispatch.setActive", effect),
);
/** Sets the fallback dispatcher for code outside a generation scope.
 * @param dispatcher - Dispatcher or undefined to clear it.
 * @returns Nothing.
 * @example setActiveRealtimeDispatcher(dispatcher);
 */
export function setActiveRealtimeDispatcher(dispatcher: RealtimeDispatcher | undefined): void {
  Effect.runSync(setActiveRealtimeDispatcherEffect(dispatcher));
}
/** Invokes one action while preserving its original synchronous return shape. */
function invokeDispatcherActionEffect<Value>(dispatcher: RealtimeDispatcher, action: () => Value) {
  return Effect.try({
    try: () => dispatchScope.run(dispatcher, action),
    catch: (cause) => new RealtimeActionError({ operation: "dispatch.runWith", cause }),
  });
}
/** Detects a promise-like action result without changing its value. */
function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}
/** Runs an action with a dispatcher in async-local generation scope.
 * @param dispatcher - Dispatcher bound during action execution.
 * @param action - Action that may return a Promise and can observe interruption through its signal.
 * @returns An Effect of the settled action result or RealtimeActionError.
 * @example Effect.runSync(runWithRealtimeDispatcherEffect(dispatcher, () => 1));
 */
export const runWithRealtimeDispatcherEffect = Effect.fn("Realtime.runWithDispatcher")(
  function* <Value>(dispatcher: RealtimeDispatcher, action: (signal: AbortSignal) => Value) {
    return yield* Effect.callback<Awaited<Value>, RealtimeActionError>((resume, signal) => {
      try {
        const value = dispatchScope.run(dispatcher, () => action(signal));
        if (!isPromiseLike(value)) {
          resume(Effect.succeed(value as Awaited<Value>));
          return;
        }
        Promise.resolve(value).then(
          (success) => resume(Effect.succeed(success as Awaited<Value>)),
          (cause) =>
            resume(Effect.fail(new RealtimeActionError({ operation: "dispatch.runWith", cause }))),
        );
      } catch (cause) {
        resume(Effect.fail(new RealtimeActionError({ operation: "dispatch.runWith", cause })));
      }
    });
  },
  (effect) => observeRealtime("dispatch.runWith", effect),
);
/** Executes an action under a dispatcher scope.
 * @param dispatcher - Dispatcher bound to the action and its async descendants.
 * @param action - Action to invoke.
 * @returns The action's value or a Promise resolving to it.
 * @throws The action's synchronous error or an Effect runtime defect.
 * @example runWithRealtimeDispatcher(dispatcher, () => channel.trigger({}, "posted", "hello"));
 */
export function runWithRealtimeDispatcher<Value>(
  dispatcher: RealtimeDispatcher,
  action: () => Value,
): Value {
  const result = Effect.runSync(Effect.result(invokeDispatcherActionEffect(dispatcher, action)));
  if (Result.isFailure(result)) {
    Effect.runSync(Effect.result(observeRealtime("dispatch.runWith", Effect.fail(result.failure))));
    throw result.failure.cause;
  }
  if (isPromiseLike(result.success)) {
    const settled = Effect.tryPromise({
      try: () => Promise.resolve(result.success),
      catch: (cause) => new RealtimeActionError({ operation: "dispatch.runWith", cause }),
    });
    void Effect.runPromise(Effect.exit(observeRealtime("dispatch.runWith", settled)));
    return result.success;
  }
  Effect.runSync(observeRealtime("dispatch.runWith", Effect.succeed(result.success)));
  return result.success;
}
/** Resolves the current dispatcher with a typed missing-binding error.
 * @returns An Effect of the dispatcher or RealtimeDispatcherError.
 * @example Effect.runPromise(currentRealtimeDispatcherEffect());
 */
export const currentRealtimeDispatcherEffect = Effect.fn("Realtime.currentDispatcher")(
  function* () {
    const service = yield* Effect.serviceOption(RealtimeDispatcherService);
    if (Option.isSome(service)) return service.value;
    const dispatcher = dispatchScope.getStore() ?? activeDispatcher;
    if (dispatcher === undefined)
      return yield* Effect.fail(
        new RealtimeDispatcherError({
          operation: "dispatch.current",
          reason: "No realtime dispatcher is active.",
        }),
      );
    return dispatcher;
  },
  (effect) => observeRealtime("dispatch.current", effect),
);
/** Returns the dispatcher bound to the current generation.
 * @returns The active dispatcher.
 * @throws Error when no dispatcher is active.
 * @example currentRealtimeDispatcher();
 */
export function currentRealtimeDispatcher(): RealtimeDispatcher {
  const result = Effect.runSync(Effect.result(currentRealtimeDispatcherEffect()));
  if (Result.isFailure(result)) throw new Error(result.failure.reason);
  return result.success;
}
