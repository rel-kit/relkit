/** Acquires watch state and joins the worker before collecting secondary native release failures. */
import { Cause, Effect, Exit, Queue, Ref, Scope } from "effect";
import { observeCli } from "../cli-runtime.js";
import { CliCleanup, cleanupEffect } from "../services/cleanup.service.js";
import { devWatchCallbacks } from "./dev-watch-callbacks.js";
import { devWatchRegistrar } from "./dev-watch-register.js";
import type { DevSession } from "./dev-session.js";
import type { DevWatchOwner, DevWatchState } from "./dev-watch-owner.types.js";

/**
 * Acquires one bounded watch owner with a finalizer installed before native registrations.
 * @param session - Existing session owning native shutdown and activation.
 * @returns Owned watch admission and release, requiring its lifetime Scope.
 */
export const makeDevWatchOwner = Effect.fn("Dev.watchOwner")(function* (session: DevSession) {
  const cleanup = yield* CliCleanup;
  const state: DevWatchState = {
    events: yield* Queue.make<readonly string[]>({ capacity: 256, strategy: "sliding" }),
    nativeFailures: yield* Ref.make<readonly Error[]>([]),
    releaseFailures: yield* Ref.make<readonly Error[]>([]),
    open: yield* Ref.make(true),
    scope: yield* Scope.make(),
    stops: [],
    configStops: new Map(),
    configPaths: new Set(),
  };
  const callbacks = devWatchCallbacks(session, state);
  const closeEffect = observeCli(
    "dev.watch.close",
    Effect.gen(function* () {
      callbacks.close();
      yield* cleanupEffect("dev.watch.worker.release", Scope.close(state.scope, Exit.void)).pipe(
        Effect.provideService(CliCleanup, cleanup),
      );
      for (const [label, failures] of [
        ["dev.watch.native", state.nativeFailures],
        ["dev.watch.registration.release", state.releaseFailures],
      ] as const) {
        yield* Effect.forEach(
          yield* Ref.getAndSet(failures, []),
          (reason) => cleanup.record(label, Cause.fail(reason)),
          { discard: true },
        );
      }
    }).pipe(Effect.uninterruptible),
  );
  yield* Effect.addFinalizer(() => closeEffect);
  const register = devWatchRegistrar(state);
  return { state, ...callbacks, closeEffect, register } satisfies DevWatchOwner;
});
