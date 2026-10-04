import { SUPERVISOR_CANDIDATE_STEPS } from "./state-machine-data.js";
import { ActivationTransitionError } from "./state-machine.schemas.js";
import type {
  SupervisorCandidatePhase,
  SupervisorCandidateToken,
  SupervisorOutcomeName,
  SupervisorPhase,
  SupervisorState,
  SupervisorStateSnapshot,
} from "./state-machine.types.js";
import type { ActivationRecord, ActivationTransition } from "./activation.types.js";

/**
 * Plans a new candidate without mutating the active generation.
 * @param snapshot - State inside the atomic Ref transaction.
 * @returns Candidate identity, new state and one transition record.
 */
export function planSourceChange(
  snapshot: SupervisorStateSnapshot,
): ActivationTransition<SupervisorCandidateToken> {
  const token = Object.freeze({
    sourceToken: snapshot.sourceToken + 1,
    generationToken: snapshot.generationToken + 1,
  });
  return {
    value: token,
    snapshot: Object.freeze({
      ...snapshot,
      ...token,
      candidate: token,
      state: "compiling-candidate",
    }),
    records: [transition(snapshot.state, "compiling-candidate", token)],
  };
}

/**
 * Plans completion while rejecting stale identities and illegal phase order.
 * @param snapshot - State inside the atomic transaction.
 * @param phase - Phase owned by the candidate.
 * @param token - Completing candidate.
 * @param success - Whether the phase succeeded.
 * @param reason - Existing failure value, retained only in lifecycle evidence.
 * @returns Accepted state and records, or a stale outcome with unchanged state.
 */
export function planCandidate(
  snapshot: SupervisorStateSnapshot,
  phase: SupervisorCandidatePhase | "switch",
  token: SupervisorCandidateToken,
  success: boolean,
  reason?: unknown,
): ActivationTransition<boolean> {
  const step = phase === "switch" ? undefined : SUPERVISOR_CANDIDATE_STEPS[phase];
  const expected = step?.expected ?? "switching";
  if (!check(snapshot, token, expected, "candidate")) return stale(snapshot, phase, token);
  const next: SupervisorState = success
    ? (step?.next ?? "active")
    : snapshot.activeGeneration === undefined
      ? "idle"
      : "active";
  const outcome = success
    ? (step?.success ?? "switch-succeeded")
    : (step?.failure ?? "switch-failed");
  return {
    value: true,
    snapshot: Object.freeze({
      ...snapshot,
      state: next,
      candidate: success ? snapshot.candidate : undefined,
    }),
    records: [
      {
        type: "outcome",
        phase,
        outcome,
        ...token,
        ...(success ? {} : { returnState: next }),
        ...failureDetail(reason),
      },
      transition(snapshot.state, next, token),
    ],
  };
}

/**
 * Plans one atomic active-generation switch after verification.
 * @param snapshot - State inside the atomic transaction.
 * @param token - Verified candidate.
 * @returns Activated state, preserving the previous generation for drain.
 */
export function planActivation(
  snapshot: SupervisorStateSnapshot,
  token: SupervisorCandidateToken,
): ActivationTransition<boolean> {
  if (!check(snapshot, token, "switching", "candidate")) return stale(snapshot, "switch", token);
  const previous = snapshot.activeGeneration;
  const next = previous === undefined ? "active" : "draining-previous";
  return {
    value: true,
    snapshot: Object.freeze({
      ...snapshot,
      state: next,
      activeGeneration: token,
      candidate: undefined,
      previousGeneration: previous,
    }),
    records: [
      {
        type: "outcome",
        phase: "switch",
        outcome: "switch-succeeded",
        ...token,
        ...(previous === undefined ? {} : { previousGeneration: previous }),
      },
      transition(snapshot.state, next, token),
    ],
  };
}

/**
 * Plans drain completion only for the active generation that owns retirement.
 * @param snapshot - State inside the atomic transaction.
 * @param token - Current active identity.
 * @param outcome - Bounded existing drain outcome.
 * @param reason - Existing failure value.
 * @returns Active state with the previous generation cleared, or stale evidence.
 */
export function planDrain(
  snapshot: SupervisorStateSnapshot,
  token: SupervisorCandidateToken,
  outcome: SupervisorOutcomeName,
  reason?: unknown,
): ActivationTransition<boolean> {
  if (!check(snapshot, token, "draining-previous", "activeGeneration"))
    return stale(snapshot, "drain", token);
  return {
    value: true,
    snapshot: Object.freeze({ ...snapshot, state: "active", previousGeneration: undefined }),
    records: [
      {
        type: "outcome",
        phase: "drain",
        outcome,
        ...token,
        ...failureDetail(reason),
        ...(snapshot.previousGeneration === undefined
          ? {}
          : {
              previousGeneration: snapshot.previousGeneration,
            }),
      },
      transition(snapshot.state, "active", token),
    ],
  };
}

/** Tests identity before phase legality. @param snapshot - Current state.
 * @param token - Completing identity. @param expected - Legal state.
 * @param owner - Identity field. @returns False for stale tokens.
 * @throws Internal state error for a current token completing an illegal phase.
 */
function check(
  snapshot: SupervisorStateSnapshot,
  token: SupervisorCandidateToken,
  expected: SupervisorState,
  owner: "candidate" | "activeGeneration",
): boolean {
  const current = snapshot[owner];
  if (
    current?.sourceToken !== token.sourceToken ||
    current.generationToken !== token.generationToken
  )
    return false;
  if (snapshot.state !== expected)
    throw new ActivationTransitionError({
      message: `Supervisor cannot transition from ${snapshot.state}; expected ${expected}.`,
    });
  return true;
}

/** Creates stale evidence without a state mutation. @param snapshot - Current state.
 * @param phase - Completing phase. @param token - Stale identity.
 * @returns False and one outcome record.
 */
function stale(
  snapshot: SupervisorStateSnapshot,
  phase: SupervisorPhase,
  token: SupervisorCandidateToken,
): ActivationTransition<boolean> {
  return {
    value: false,
    snapshot,
    records: [{ type: "outcome", phase, outcome: "candidate-stale", ...token }],
  };
}

/** Creates transition evidence. @param from - Previous state. @param to - Committed state.
 * @param token - Owning identity. @returns One immutable-record input.
 */
function transition(
  from: SupervisorState,
  to: SupervisorState,
  token: SupervisorCandidateToken,
): ActivationRecord {
  return { type: "transition", from, to, ...token };
}

/** Retains the existing lifecycle error shape. @param reason - Existing failure value.
 * @returns Optional code/message detail; operation metrics never contain the reason.
 */
function failureDetail(
  reason: unknown,
): Pick<Extract<ActivationRecord, { type: "outcome" }>, "error"> {
  if (reason === undefined) return {};
  if (typeof reason === "string") return { error: { message: reason } };
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    const value = reason as { readonly code?: unknown; readonly message?: unknown };
    if (typeof value.message === "string")
      return {
        error: {
          ...(typeof value.code === "string" ? { code: value.code } : {}),
          message: value.message,
        },
      };
  }
  return { error: { message: "Candidate lifecycle operation failed." } };
}
