/**
 * Publishes an already verified child in one uninterruptible state turn. The
 * synchronous epoch fence shares the proxy switch's turn; committed drains own
 * promoted children and active-child observers belong to the session lifetime.
 */
import { Effect, MutableRef, Ref } from "effect";
import { createSupervisorDrain, type StartedCandidate } from "@relkit/supervisor";
import type { RuntimeActivationFingerprint } from "@relkit/contracts";
import { cliPromise, cliTry } from "../cli-errors.js";
import { cleanupEffect } from "../services/cleanup.service.js";
import { tokenKey } from "./dev-generation-key.js";
import type { DevActivationAttempt } from "./dev-activation.types.js";

/**
 * Fences source version, cancellation and epoch before switching traffic.
 * @param attempt - Admitted generation and promotion witness.
 * @param candidate - Child already matched to its complete expected cohort.
 * @param fingerprint - Validated activation identity.
 * @returns True only after proxy and supervisor state commit together.
 */
export function publishActivation(
  attempt: DevActivationAttempt,
  candidate: StartedCandidate,
  fingerprint: RuntimeActivationFingerprint,
) {
  return cliTry("dev.candidate.publish", () => {
    const { session, token, signal, version } = attempt;
    const state = Ref.getUnsafe(session.state);
    if (
      state.stopping ||
      state.latestVersion !== version ||
      signal.aborted ||
      session.options.candidateAdmission?.(candidate) === false ||
      !session.stateMachine.verificationSucceeded(token)
    )
      return false;
    const previous = session.active;
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
    MutableRef.set(attempt.promoted.ref, true);
    return true;
  }).pipe(Effect.uninterruptible);
}

/**
 * Observes an active child's exit in the session's retained lifetime.
 * @param attempt - Session lifetime and shutdown latch.
 * @param candidate - Promoted child with a joined physical exit receipt.
 * @returns Observer; retired child exits cannot stop the new generation.
 */
export function observeActivatedChild(attempt: DevActivationAttempt, candidate: StartedCandidate) {
  const session = attempt.session;
  return Effect.forkIn(
    cliPromise("dev.candidate.exit", () => candidate.exited).pipe(
      Effect.flatMap((code) =>
        Effect.sync(() => {
          if (candidate === session.active && !session.isStopping)
            session.nativeEngine.requestStop(
              new Error(`Backend generation exited with code ${code}.`),
            );
        }),
      ),
      Effect.catchCause((cause) => cleanupEffect("dev.candidate.exit", Effect.failCause(cause))),
    ),
    session.nativeEngine.scope,
  );
}
