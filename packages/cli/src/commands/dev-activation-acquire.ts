/**
 * Owns unpublished child acquisition and cancellation. Promotion transfers child
 * disposal to the existing generation drain; unsuccessful attempts release locally.
 */
import { Effect, Ref } from "effect";
import type { CandidateOptions } from "@relkit/supervisor";
import { cliTry } from "../cli-errors.js";
import { CliDevSupervisor } from "../services/dev-supervisor.service.js";
import { cleanupEffect } from "../services/cleanup.service.js";
import type { DevSession } from "./dev-session.js";
import type { DevActivationAttempt } from "./dev-activation.types.js";

/**
 * Owns cancellation before invoking the native supervisor.
 * @param session - Session state and lifetime owner.
 * @param version - Requested source version.
 * @param changedFiles - Bounded change evidence.
 * @returns Scoped attempt witness with exactly-once controller registration release.
 */
export const acquireActivationAttempt = Effect.fn("Dev.activation.attempt")(function* (
  session: DevSession,
  version: number,
  changedFiles: readonly string[],
) {
  const token = yield* cliTry("dev.state.request", () =>
    session.stateMachine.requestSourceChange(),
  );
  const initial = session.active === undefined;
  session.log({
    level: "info",
    event: "dev.build.started",
    fields: { initial, files: [...changedFiles] },
  });
  const controller = yield* Effect.acquireRelease(
    Effect.sync(() => new AbortController()).pipe(
      Effect.tap((controller) =>
        Ref.update(session.state, (state) => ({
          ...state,
          controllers: new Set([...state.controllers, controller]),
        })),
      ),
    ),
    (controller) =>
      Ref.update(session.state, (state) => {
        const controllers = new Set(state.controllers);
        controllers.delete(controller);
        return { ...state, controllers };
      }),
  );
  return {
    session,
    token,
    version,
    changedFiles,
    initial,
    startedAt: performance.now(),
    signal: AbortSignal.any([session.abortController.signal, controller.signal]),
    promoted: yield* Ref.make(false),
  } satisfies DevActivationAttempt;
});

/**
 * Starts an owned child and removes failed-attempt fingerprint receipts on release.
 * @param attempt - Scoped generation and promotion witness.
 * @returns Unpublished child whose physical acquisition is joined by the SDK adapter.
 */
export const acquireActivationCandidate = Effect.fn("Dev.activation.child")(function* (
  attempt: DevActivationAttempt,
) {
  const sdk = yield* CliDevSupervisor;
  return yield* Effect.acquireRelease(sdk.start(candidateOptions(attempt)), (candidate) =>
    Ref.get(attempt.promoted).pipe(
      Effect.flatMap((active) =>
        active
          ? Effect.void
          : cleanupEffect("dev.candidate.release", sdk.dispose(candidate)).pipe(
              Effect.andThen(
                Ref.update(attempt.session.state, (state) => {
                  const fingerprints = new Map(state.fingerprints);
                  fingerprints.delete(candidate.token.generationToken);
                  return { ...state, fingerprints };
                }),
              ),
            ),
      ),
    ),
  );
});

/**
 * Projects session policy to the unchanged supervisor candidate contract.
 * @param attempt - Session with admitted cancellation/token witnesses.
 * @returns Explicit native inputs with no hidden compile or startup work.
 */
function candidateOptions(attempt: DevActivationAttempt): CandidateOptions {
  const { session, token, signal } = attempt;
  const options = session.options;
  return {
    projectRoot: session.projectRoot,
    token,
    compile: options.compile,
    port: 0,
    signal,
    ...(options.candidateHostname === undefined ? {} : { hostname: options.candidateHostname }),
    ...(options.generatedDirectory === undefined
      ? {}
      : { generatedDirectory: options.generatedDirectory }),
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    ...(options.maxStartupOutputBytes === undefined
      ? {}
      : { maxStartupOutputBytes: options.maxStartupOutputBytes }),
    ...(options.candidateStopTimeoutMs === undefined
      ? {}
      : { stopTimeoutMs: options.candidateStopTimeoutMs }),
    logger: (event) =>
      session.log({
        level: event.level,
        event: event.event,
        fields: {
          directory: event.directory,
          ...(event.stream === undefined ? {} : { stream: event.stream }),
          ...(event.output === undefined ? {} : { output: event.output }),
          ...event.fields,
        },
      }),
  };
}
