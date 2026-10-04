import { Cause, Effect, Exit, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import type { SupervisorStateMachine } from "./state-machine.js";
import type { PendingChange, WatcherState, SupervisorCompile } from "./watcher.types.js";

/**
 * Runs a native compiler with real cancellation and removes its signal listener on every exit.
 * @param pending - Admitted source batch.
 * @param controller - Controller also aborted synchronously by newer notifications.
 * @param compiler - Native boundary, which must consume its signal.
 * @param state - Authoritative watcher state borrowed by the current-identity callback.
 * @param machine - Activation owner receiving original success/rejection details.
 * @returns Settled compilation; typed rejections become existing lifecycle failures.
 */
export function runWatcherCompile(
  pending: PendingChange,
  controller: AbortController,
  compiler: SupervisorCompile,
  state: Ref.Ref<WatcherState>,
  machine: SupervisorStateMachine,
): Effect.Effect<void> {
  return Effect.suspend(() => {
    /** Unregisters the installed native abort listener. @returns After detaching, or before any listener exists. */
    let remove = () => undefined;
    let native: Promise<void> | undefined;
    return observeExecution(
      "supervisor",
      "watcher.compile",
      Effect.tryPromise({
        try: (signal) => {
          /** Forwards fiber interruption to the owned compiler. @returns After native abort callbacks. */
          const abort = () => controller.abort(signal.reason);
          signal.addEventListener("abort", abort, { once: true });
          remove = () => {
            signal.removeEventListener("abort", abort);
          };
          if (signal.aborted) abort();
          native = Promise.resolve(
            compiler({
              ...pending,
              signal: controller.signal,
              isCurrent: () => isCurrent(Ref.getUnsafe(state), pending, machine),
            }),
          );
          return native;
        },
        catch: (error) => error,
      }),
      () => ({ files: pending.changedFiles.length }),
    ).pipe(
      Effect.matchEffect({
        onSuccess: () =>
          Effect.sync(() => {
            machine.compileSucceeded(pending.token);
          }),
        onFailure: (error) =>
          Effect.sync(() => {
            machine.compileFailed(pending.token, error);
          }),
      }),
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          remove();
          if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause) && native !== undefined)
            yield* Effect.promise(() =>
              native!.then(
                () => undefined,
                () => undefined,
              ),
            );
        }),
      ),
    );
  });
}

/** Reads current source and activation identity without allocating a nested runtime.
 * @param state - Synchronous Ref snapshot. @param pending - Worker identity.
 * @param machine - Borrowed activation owner. @returns Whether completion can still apply.
 */
function isCurrent(
  state: WatcherState,
  pending: PendingChange,
  machine: SupervisorStateMachine,
): boolean {
  const candidate = machine.snapshot().candidate;
  return (
    !state.disposed &&
    state.version === pending.version &&
    candidate?.sourceToken === pending.token.sourceToken &&
    candidate.generationToken === pending.token.generationToken
  );
}
