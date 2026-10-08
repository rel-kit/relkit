import { Effect, Ref } from "effect";
import {
  createSupervisorDrain,
  type StartedCandidate,
  type SupervisorCandidateToken,
} from "@relkit/supervisor";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliDevSupervisor } from "../services/dev-supervisor.service.js";
import { devSessionCapabilitiesLayer } from "./dev-session-engine.js";
import { tokenKey } from "./dev-generation-key.js";
import type { DevSession } from "./dev-session.js";

/**
 * Drains a retired generation and releases its session identity after the bounded SDK receipt.
 * @param session - Drain owner map.
 * @param previous - Old accepted candidate.
 * @param activeToken - New active state token.
 * @returns Joined bounded drain.
 */
export const drainCandidateEffect = Effect.fn("Dev.drain")(
  function* (
    session: DevSession,
    previous: StartedCandidate,
    activeToken: SupervisorCandidateToken,
  ) {
    const sdk = yield* CliDevSupervisor;
    const key = tokenKey(previous.token);
    const drain = yield* cliTry(
      "dev.drain.owner",
      () =>
        session.drains.get(key) ??
        createSupervisorDrain({
          token: previous.token,
          candidate: previous,
          ...(session.options.drainTimeoutMs === undefined
            ? {}
            : { deadlineMs: session.options.drainTimeoutMs }),
        }),
    );
    const report = yield* sdk.drain(drain).pipe(
      Effect.uninterruptible,
      Effect.ensuring(
        Ref.update(session.state, (state) => {
          const drains = new Map(state.drains);
          drains.delete(key);
          const fingerprints = new Map(state.fingerprints);
          fingerprints.delete(previous.token.generationToken);
          return { ...state, drains, fingerprints };
        }),
      ),
    );
    yield* cliTry("dev.state.drained", () =>
      report.outcome === "drained"
        ? session.stateMachine.drainSucceeded(activeToken)
        : session.stateMachine.drainFailed(activeToken, report.outcome),
    );
  },
  (effect, _session: DevSession, _previous: StartedCandidate, _token: SupervisorCandidateToken) =>
    observeCli("dev.drain", effect),
);

/** Joins retirement of an old generation through the public session owner.
 * @param session - Session.
 * @param previous - Old generation.
 * @param activeToken - New state token.
 * @returns Public joined drain.
 */
export function drainCandidate(
  session: DevSession,
  previous: StartedCandidate,
  activeToken: SupervisorCandidateToken,
): Promise<void> {
  return runCliEffect(
    drainCandidateEffect(session, previous, activeToken),
    devSessionCapabilitiesLayer,
  );
}
