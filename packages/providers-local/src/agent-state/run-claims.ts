import type { ClaimRunRequest, ExecutionClaim, RenewRunClaimRequest } from "@relkit/agents";
import { activeClaim, LocalAgentStateError, ownedThread } from "./common.js";
import { replaceThread, requireRun } from "./run-state.js";
import type { AgentStateStore } from "./storage.js";

export function claimRun(
  store: AgentStateStore,
  request: ClaimRunRequest,
): Promise<ExecutionClaim> {
  return store.update((state) => {
    const local = ownedThread(state, request, request.threadId);
    const run = requireRun(local, request.runId);
    if (run.status !== "accepted")
      throw new LocalAgentStateError(
        "AGENT_WORKER_INTERRUPTED",
        "Only newly accepted work can acquire an execution claim.",
      );
    const previous = local.runClaims[request.runId];
    if (previous !== undefined && Date.parse(previous.expiresAt) > Date.now())
      throw new LocalAgentStateError("RUN_ALREADY_CLAIMED", "Run has an active claim.");
    const claim: ExecutionClaim = {
      claimId: crypto.randomUUID(),
      runId: request.runId,
      workerId: request.workerId,
      generationId: request.generationId,
      fence: local.nextFence + 1,
      expiresAt: request.expiresAt,
    };
    return [
      replaceThread(state, request.threadId, {
        ...local,
        nextFence: claim.fence,
        runClaims: { ...local.runClaims, [request.runId]: claim },
        runs: { ...local.runs, [request.runId]: { ...run, status: "running" } },
      }),
      claim,
    ] as const;
  });
}

export function renewRunClaim(
  store: AgentStateStore,
  request: RenewRunClaimRequest,
): Promise<ExecutionClaim> {
  return store.update((state) => {
    const local = ownedThread(state, request, request.threadId);
    activeClaim(local.runClaims[request.runId], request.claim);
    const claim = { ...request.claim, expiresAt: request.expiresAt };
    return [
      replaceThread(state, request.threadId, {
        ...local,
        runClaims: { ...local.runClaims, [request.runId]: claim },
      }),
      claim,
    ] as const;
  });
}
