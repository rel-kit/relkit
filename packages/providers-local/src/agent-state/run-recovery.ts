/** Recovers expired execution leases only after typed scoped ownership validation. */
import type { RecoveryRequest } from "./run-recovery.types.js";
import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import { checkpoint, encodedBytes, ownedThread } from "./common.js";
import { replaceThread } from "./run-state.js";
import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";
import type { LocalAgentState } from "./state.js";

/** Provider-owned lease recovery; stale executors never receive write authority.
 * @param store - Owning transaction or durable journal operations.
 * @param request - Validated scoped domain request.
 * @param now - Clock time in milliseconds.
 * @returns A lazy effect completing after an expired run claim is safely recovered.
 */
export const recoverExpiredRun = Effect.fn("AgentState.recoverExpiredRun")(
  function* (store: AgentStateStore, request: RecoveryRequest, now?: number) {
    const operationNow = yield* Clock.currentTimeMillis;
    now ??= operationNow;

    const state = yield* store.read();
    if (!(yield* localSync(() => shouldRecover(state, request, now ?? operationNow)))) return false;
    return yield* store.update((current) => recoverRunState(current, request, now ?? operationNow));
  },
  (effect) => localOperation("AgentState.recoverExpiredRun", effect),
);

/** Rechecks the current lease inside its atomic update before publishing interruption. */
function recoverRunState(state: LocalAgentState, request: RecoveryRequest, now: number) {
  const local = ownedThread(state, request, request.threadId);
  const runId = local.activeRunId;
  if (runId === undefined) return [state, false] as const;
  const run = local.runs[runId];
  if (run === undefined || isStable(run.status)) return [state, false] as const;
  const claim = local.runClaims[runId];
  const expired =
    claim === undefined
      ? Date.parse(run.acceptedAt) + REALTIME_RUNTIME_LIMITS.leaseExpiryMs <= now
      : Date.parse(claim.expiresAt) <= now;
  if (!expired) return [state, false] as const;
  const createdAt = new Date(now).toISOString();
  const sequence = local.sequence + 1;
  const point = checkpoint(state, request, request.threadId, sequence);
  const value = { reason: "claim-expired" as const };
  const record = {
    recordId: crypto.randomUUID(),
    runId,
    kind: "interruption" as const,
    publicValue: value,
    checkpoint: point,
    encodedBytes: encodedBytes(value),
    createdAt,
  };
  const { [runId]: _claim, ...claims } = local.runClaims;
  return [
    replaceThread(state, request.threadId, {
      ...local,
      sequence,
      journal: [...local.journal, record],
      runClaims: claims,
      runs: {
        ...local.runs,
        [runId]: {
          ...run,
          status: "worker-interrupted",
          outcome: "worker-interrupted",
          settledAt: createdAt,
        },
      },
      thread: {
        ...local.thread,
        status: "worker-interrupted",
        updatedAt: createdAt,
        revision: String(Number(local.thread.revision) + 1),
      },
    }),
    true,
  ] as const;
}

/**
 * Checks whether a running claim expired and recovery can safely proceed.
 * @param state - Persisted domain snapshot.
 * @param request - Validated domain request and scope.
 * @param now - Current clock time in milliseconds.
 * @returns Whether the expired run can be recovered safely.
 */
function shouldRecover(
  state: import("./state.js").LocalAgentState,
  request: RecoveryRequest,
  now: number,
): boolean {
  const local = ownedThread(state, request, request.threadId);
  const runId = local.activeRunId;
  if (runId === undefined) return false;
  const run = local.runs[runId];
  if (run === undefined || isStable(run.status)) return false;
  const claim = local.runClaims[runId];
  return claim === undefined
    ? Date.parse(run.acceptedAt) + REALTIME_RUNTIME_LIMITS.leaseExpiryMs <= now
    : Date.parse(claim.expiresAt) <= now;
}

/**
 * Distinguishes settled run states from work eligible for recovery.
 * @param status - Public lifecycle status.
 * @returns Whether the run has a settled lifecycle state.
 */
function isStable(status: string): boolean {
  return ["waiting", "succeeded", "failed", "cancelled", "worker-interrupted"].includes(status);
}
