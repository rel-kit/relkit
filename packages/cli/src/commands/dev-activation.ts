/**
 * Composes scoped child acquisition, complete cohort/application verification and
 * atomic activation through the existing supervisor. Selective expected recovery
 * preserves last-known-good traffic and never swallows mixed Causes.
 */
import { Effect, Exit, Ref } from "effect";
import type { SupervisorCandidateToken } from "@relkit/supervisor";
import { redactFailureDetail } from "@relkit/runtime-effect";
import { CliAdapterError, cliOriginalError, cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliDevSupervisor } from "../services/dev-supervisor.service.js";
import { resolveActivationFingerprintEffect } from "./dev-activation-fingerprint.js";
import { devSessionCapabilitiesLayer } from "./dev-session-engine.js";
import { acquireActivationAttempt, acquireActivationCandidate } from "./dev-activation-acquire.js";
import { publishActivation, observeActivatedChild } from "./dev-activation-publish.js";
import { drainCandidateEffect } from "./dev-drain.js";
import type { DevSession } from "./dev-session.js";
import type { DevActivationAttempt } from "./dev-activation.types.js";
export { drainCandidate, drainCandidateEffect } from "./dev-drain.js";

/**
 * Verifies and publishes one generation; failed attempts remain Scope-owned.
 * @param session - Session state, compiler and native authority owner.
 * @param version - Admitted source version.
 * @param changedFiles - Bounded changed-file evidence.
 * @returns Acceptance; expected later failures retain the previous active target.
 */
export const activateCandidateEffect = Effect.fn("Dev.activate")(
  (session: DevSession, version: number, changedFiles: readonly string[]) =>
    observeCli(
      "dev.activation",
      Effect.scoped(
        Effect.gen(function* () {
          const attempt = yield* acquireActivationAttempt(session, version, changedFiles);
          return yield* runActivation(attempt).pipe(
            Effect.catchCause((cause) => {
              const reason = cause.reasons[0];
              if (
                cause.reasons.length !== 1 ||
                reason?._tag !== "Fail" ||
                !(reason.error instanceof CliAdapterError)
              )
                return Effect.failCause(cause);
              return recoverActivation(attempt, reason.error);
            }),
          );
        }),
      ),
    ),
);

/**
 * Runs the complete protocol and prepared-route proof before publication.
 * @param attempt - Scoped generation with promotion and cancellation witnesses.
 * @returns Committed acceptance or typed SDK/application failure.
 */
const runActivation = Effect.fn("Dev.activation.protocol")(function* (
  attempt: DevActivationAttempt,
) {
  const { session, token, signal, version, changedFiles, initial, startedAt } = attempt;
  const sdk = yield* CliDevSupervisor;
  const candidate = yield* acquireActivationCandidate(attempt);
  const accepted = yield* cliTry(
    "dev.state.started",
    () =>
      session.stateMachine.compileSucceeded(token) && session.stateMachine.startSucceeded(token),
  );
  if (!accepted) return false;
  const fingerprint = yield* resolveActivationFingerprintEffect(session, candidate);
  yield* Ref.update(session.state, (state) => ({
    ...state,
    fingerprints: new Map([...state.fingerprints, [token.generationToken, fingerprint]]),
  }));
  const supervisorVerification = sdk.verify({
    candidate,
    activationFingerprint: fingerprint,
    signal,
    ...(session.options.candidateVerificationFetch === undefined
      ? {}
      : { fetch: session.options.candidateVerificationFetch }),
    ...(session.options.healthTimeoutMs === undefined
      ? {}
      : { healthTimeoutMs: session.options.healthTimeoutMs }),
    ...(session.options.candidateVerificationConcurrentHealth === undefined
      ? {}
      : { concurrentHealth: session.options.candidateVerificationConcurrentHealth }),
  });
  const routeVerification =
    session.options.candidateVerificationEffect?.(candidate, signal) ?? Effect.void;
  yield* Effect.all([supervisorVerification, routeVerification], {
    concurrency: "unbounded",
    discard: true,
  });
  const previous = session.active;
  const published = yield* publishActivation(attempt, candidate, fingerprint).pipe(
    Effect.onExit((exit) =>
      Exit.isFailure(exit)
        ? Effect.sync(() => session.options.candidateVerificationRejected?.(candidate))
        : Effect.void,
    ),
  );
  if (!published) {
    session.options.candidateVerificationRejected?.(candidate);
    return false;
  }
  session.options.candidateVerificationPublished?.(candidate);
  yield* observeActivatedChild(attempt, candidate);
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
});

/**
 * Records one expected boundary failure without replacing initial-start errors.
 * @param attempt - Failing unpublished generation.
 * @param error - Singleton expected failure; mixed Causes never enter this branch.
 * @returns False for a failed edit, or the original initial failure.
 */
const recoverActivation = Effect.fn("Dev.activation.failure")(function* (
  attempt: DevActivationAttempt,
  error: CliAdapterError,
) {
  const { session, token, initial } = attempt;
  yield* cliTry("dev.state.failed", () => failState(session, token, cliOriginalError(error)));
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
});

/**
 * Runs the public Promise edge using explicit native capabilities.
 * @param session - Public session facade.
 * @param version - Requested source version.
 * @param changedFiles - Changed paths.
 * @returns Joined acceptance after failed-attempt cleanup.
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

/**
 * Retains the original native reason in the supervisor's phase-specific failure.
 * @typeParam Reason - Actual original native failure contract.
 * @param session - Owning state machine.
 * @param token - Failed generation identity.
 * @param error - Original failure retained by the SDK compatibility boundary.
 * @returns No value.
 */
function failState<Reason>(
  session: DevSession,
  token: SupervisorCandidateToken,
  error: Reason,
): void {
  const state = session.stateMachine.state;
  if (state === "compiling-candidate") session.stateMachine.compileFailed(token, error);
  else if (state === "starting-candidate") session.stateMachine.startFailed(token, error);
  else if (state === "verifying-hash-and-readiness")
    session.stateMachine.verificationFailed(token, error);
  else if (state === "switching") session.stateMachine.switchFailed(token, error);
}
