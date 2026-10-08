import { Effect, MutableRef, Ref } from "effect";
import { createSupervisorDrain, type SupervisorCandidateToken } from "@relkit/supervisor";
import { redactFailureDetail } from "@relkit/runtime-effect";
import { cliOriginalError, cliPromise, cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliDevSupervisor } from "../services/dev-supervisor.service.js";
import { cleanupEffect } from "../services/cleanup.service.js";
import { resolveActivationFingerprintEffect } from "./dev-activation-fingerprint.js";
import { devSessionCapabilitiesLayer } from "./dev-session-engine.js";
import type { DevSession } from "./dev-session.js";
import { tokenKey } from "./dev-generation-key.js";
import { drainCandidateEffect } from "./dev-drain.js";
export { drainCandidate, drainCandidateEffect } from "./dev-drain.js";

/**
 * Starts and verifies a private candidate, then atomically publishes its traffic target.
 * @param session - Session-owned state and lifetime.
 * @param version - Admitted source version.
 * @param changedFiles - Bounded work evidence.
 * @returns Whether this generation became active; expected later failures retain the old target.
 */
export const activateCandidateEffect = Effect.fn("Dev.activate")(
  function* (session: DevSession, version: number, changedFiles: readonly string[]) {
    const sdk = yield* CliDevSupervisor;
    const token = yield* cliTry("dev.state.request", () =>
      session.stateMachine.requestSourceChange(),
    );
    const initial = session.active === undefined;
    const startedAt = performance.now();
    session.log({
      level: "info",
      event: "dev.build.started",
      fields: { initial, files: [...changedFiles] },
    });
    return yield* Effect.scoped(
      Effect.gen(function* () {
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
        const signal = AbortSignal.any([session.abortController.signal, controller.signal]);
        const promoted = yield* Ref.make(false);
        const candidate = yield* Effect.acquireRelease(
          sdk.start({
            projectRoot: session.projectRoot,
            token,
            compile: session.options.compile,
            port: 0,
            signal,
            ...(session.options.candidateHostname === undefined
              ? {}
              : { hostname: session.options.candidateHostname }),
            ...(session.options.generatedDirectory === undefined
              ? {}
              : { generatedDirectory: session.options.generatedDirectory }),
            ...(session.options.environment === undefined
              ? {}
              : { environment: session.options.environment }),
            ...(session.options.maxStartupOutputBytes === undefined
              ? {}
              : { maxStartupOutputBytes: session.options.maxStartupOutputBytes }),
            ...(session.options.candidateStopTimeoutMs === undefined
              ? {}
              : { stopTimeoutMs: session.options.candidateStopTimeoutMs }),
            logger: (event) =>
              session.log({
                level: event.level,
                event: event.event,
                fields: {
                  directory: event.directory,
                  ...(event.stream === undefined ? {} : { stream: event.stream }),
                  ...(event.output === undefined ? {} : { output: event.output }),
                  ...(event.fields ?? {}),
                },
              }),
          }),
          (candidate) =>
            Ref.get(promoted).pipe(
              Effect.flatMap((active) =>
                active
                  ? Effect.void
                  : cleanupEffect("dev.candidate.release", sdk.dispose(candidate)).pipe(
                      Effect.andThen(
                        Ref.update(session.state, (state) => {
                          const fingerprints = new Map(state.fingerprints);
                          fingerprints.delete(candidate.token.generationToken);
                          return { ...state, fingerprints };
                        }),
                      ),
                    ),
              ),
            ),
        );
        const accepted = yield* cliTry(
          "dev.state.started",
          () =>
            session.stateMachine.compileSucceeded(token) &&
            session.stateMachine.startSucceeded(token),
        );
        if (!accepted) return false;
        const fingerprint = yield* resolveActivationFingerprintEffect(session, candidate);
        yield* Ref.update(session.state, (state) => ({
          ...state,
          fingerprints: new Map([...state.fingerprints, [token.generationToken, fingerprint]]),
        }));
        yield* sdk.verify({
          candidate,
          activationFingerprint: fingerprint,
          signal,
          ...(session.options.healthTimeoutMs === undefined
            ? {}
            : { healthTimeoutMs: session.options.healthTimeoutMs }),
        });
        const previous = session.active;
        const published = yield* cliTry("dev.candidate.publish", () => {
          const state = Ref.getUnsafe(session.state);
          if (
            state.stopping ||
            state.latestVersion !== version ||
            signal.aborted ||
            !session.stateMachine.verificationSucceeded(token)
          )
            return false;
          const key = tokenKey(candidate.token);
          const drain = createSupervisorDrain({
            token: candidate.token,
            candidate,
            ...(session.options.drainTimeoutMs === undefined
              ? {}
              : { deadlineMs: session.options.drainTimeoutMs }),
          });
          const drains = new Map(state.drains);
          drains.set(key, drain);
          MutableRef.set(session.state.ref, { ...state, drains });
          if (!session.proxy.compareAndSwitch(previous?.token, candidate)) {
            drains.delete(key);
            session.stateMachine.switchFailed(token, "The stable proxy target changed.");
            return false;
          }
          session.stateMachine.switchSucceeded(token);
          MutableRef.update(session.state.ref, (state) => ({
            ...state,
            active: candidate,
            fingerprint,
          }));
          MutableRef.set(promoted.ref, true);
          return true;
        }).pipe(Effect.uninterruptible);
        if (!published) return false;
        yield* Effect.forkIn(
          cliPromise("dev.candidate.exit", () => candidate.exited).pipe(
            Effect.flatMap((code) =>
              Effect.sync(() => {
                if (candidate === session.active && !session.isStopping)
                  session.nativeEngine.requestStop(
                    new Error(`Backend generation exited with code ${code}.`),
                  );
              }),
            ),
            Effect.catchTag("CliAdapterError", (error) =>
              cleanupEffect("dev.candidate.exit", Effect.fail(error)),
            ),
          ),
          session.nativeEngine.scope,
        );
        if (previous !== undefined) yield* drainCandidateEffect(session, previous, token);
        session.log({
          level: "info",
          event: "dev.generation.active",
          fields: {
            version,
            changedFiles: changedFiles.length,
            initial,
            durationMs: performance.now() - startedAt,
          },
        });
        return true;
      }).pipe(
        Effect.catchTag("CliAdapterError", (error) =>
          Effect.gen(function* () {
            yield* cliTry("dev.state.failed", () =>
              failState(session, token, cliOriginalError(error)),
            );
            if (initial) return yield* Effect.fail(error);
            session.log({
              level: session.abortController.signal.aborted ? "debug" : "error",
              event: "dev.generation.failed",
              fields: {
                message: error.message,
                error: redactFailureDetail(cliOriginalError(error), undefined, 0, true),
                previousActive: session.active !== undefined,
              },
            });
            return false;
          }),
        ),
      ),
    );
  },
  (effect, _session: DevSession, _version: number, _files: readonly string[]) =>
    observeCli("dev.activation", effect),
);

/** Runs one candidate activation through the captured public session owner.
 * @param session - Session.
 * @param version - Source version.
 * @param changedFiles - Changed paths.
 * @returns Public acceptance result.
 */
export function activateCandidate(
  session: DevSession,
  version: number,
  changedFiles: readonly string[],
): Promise<boolean> {
  return runCliEffect(
    activateCandidateEffect(session, version, changedFiles),
    devSessionCapabilitiesLayer,
  );
}
/** Records an activation failure in the supervisor state machine.
 * @param session - State machine.
 * @param token - Failed operation identity.
 * @param error - Original native reason.
 * @returns No value.
 */
function failState(session: DevSession, token: SupervisorCandidateToken, error: unknown): void {
  const state = session.stateMachine.state;
  if (state === "compiling-candidate") session.stateMachine.compileFailed(token, error);
  else if (state === "starting-candidate") session.stateMachine.startFailed(token, error);
  else if (state === "verifying-hash-and-readiness")
    session.stateMachine.verificationFailed(token, error);
  else if (state === "switching") session.stateMachine.switchFailed(token, error);
}
