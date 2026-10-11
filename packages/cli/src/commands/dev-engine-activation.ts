/**
 * Owns ordered candidate admission and the single serialized activation worker.
 * Cancellation supersedes candidates before enqueueing a newer source version;
 * every caller receives the completed activation result rather than a banner.
 */
import { Cause, Deferred, Effect, Queue, Ref } from "effect";
import { observeCli } from "../cli-runtime.js";
import { activateCandidateEffect } from "./dev-activation.js";
import { provideDevEngine } from "./dev-engine-state.js";
import type { CliAdapterError } from "../cli-errors.js";
import type { DevEngineState } from "./dev-engine-state.types.js";
import type { DevSession } from "./dev-session.js";

/**
 * Runs admitted requests until the session owner interrupts and joins the worker.
 * @param owner - Captured queue, Scope and cleanup authority.
 * @param session - State-machine/proxy owner.
 * @returns Scoped worker computation; non-cancellation failures retain complete Cause evidence.
 */
export function devActivationWorker(owner: DevEngineState, session: DevSession) {
  return Effect.forever(
    Effect.gen(function* () {
      const request = yield* Queue.take(owner.queue);
      const state = yield* Ref.get(session.state);
      const activation =
        state.stopping || state.latestVersion !== request.version
          ? Effect.succeed(false)
          : provideDevEngine(
              owner,
              activateCandidateEffect(session, request.version, request.changedFiles),
            );
      yield* Deferred.complete(request.result, activation);
      yield* Ref.update(session.state, (state) => ({
        ...state,
        pending: state.pending.filter((entry) => entry !== request),
      }));
    }),
  ).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.void
        : owner.cleanup.record("dev.activation.worker", cause),
    ),
  );
}

/**
 * Admits a new source version atomically and joins its serialized result.
 * @param owner - Session queue and captured authorities.
 * @param session - Generation state and candidate cancellation controllers.
 * @param version - Requested source version or the next monotonic version.
 * @param changedFiles - Bounded evidence supplied by the watcher.
 * @returns Acceptance result; stale/stopped requests return false.
 */
export function admitDevActivation(
  owner: DevEngineState,
  session: DevSession,
  version?: number,
  changedFiles: readonly string[] = [],
) {
  return observeCli(
    "dev.session.activate",
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const result = yield* Deferred.make<boolean, CliAdapterError>();
        const request = yield* Ref.modify(session.state, (state) => {
          const next = version ?? state.latestVersion + 1;
          if (state.stopping || next < state.latestVersion) return [undefined, state] as const;
          for (const controller of state.controllers)
            controller.abort(new Error("A newer source version superseded this candidate."));
          const request = { version: next, changedFiles, result };
          return [
            request,
            { ...state, latestVersion: next, pending: [...state.pending, request] },
          ] as const;
        });
        if (request === undefined) return false;
        yield* Queue.offer(owner.queue, request);
        return yield* restore(Deferred.await(result));
      }),
    ),
  );
}
