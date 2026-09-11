import type { AgentRequestScope } from "@relkit/agents";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import { checkpoint, encodedBytes, ownedThread } from "./common.js";
import { replaceThread } from "./run-state.js";
import type { AgentStateStore } from "./storage.js";

type RecoveryRequest = AgentRequestScope & { readonly threadId: string };

/** Provider-owned lease recovery; stale executors never receive write authority. */
export async function recoverExpiredRun(
  store: AgentStateStore,
  request: RecoveryRequest,
  now = Date.now(),
): Promise<boolean> {
  if (!shouldRecover(await store.read(), request, now)) return false;
  return store.update((state) => {
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
  });
}

function shouldRecover(
  state: Awaited<ReturnType<AgentStateStore["read"]>>,
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

function isStable(status: string): boolean {
  return ["waiting", "succeeded", "failed", "cancelled", "worker-interrupted"].includes(status);
}
