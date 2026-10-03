import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type { ClaimRunRequest, ExecutionClaim, RenewRunClaimRequest } from "@relkit/agents";
import { activeClaim, LocalAgentStateError, ownedThread } from "./common.js";
import { replaceThread, requireRun } from "./run-state.js";
import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";

/**
 * Acquires a fenced worker claim for an accepted run.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const claimRun = Effect.fn("AgentState.claimRun")(
  function* (store: AgentStateStore, request: ClaimRunRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return store.update((state) => {
          const local = ownedThread(state, request, request.threadId);
          const run = requireRun(local, request.runId);
          if (run.status !== "accepted")
            throw new LocalAgentStateError(
              "AGENT_WORKER_INTERRUPTED",
              "Only newly accepted work can acquire an execution claim.",
            );
          const previous = local.runClaims[request.runId];
          if (previous !== undefined && Date.parse(previous.expiresAt) > operationNow)
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
      }),
    );
  },
  (effect) => localOperation("AgentState.claimRun", effect),
);

/**
 * Extends a run lease only while the supplied worker still owns its fence.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const renewRunClaim = Effect.fn("AgentState.renewRunClaim")(
  function* (store: AgentStateStore, request: RenewRunClaimRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return store.update((state) => {
          const local = ownedThread(state, request, request.threadId);
          activeClaim(local.runClaims[request.runId], request.claim, operationNow);
          const claim = { ...request.claim, expiresAt: request.expiresAt };
          return [
            replaceThread(state, request.threadId, {
              ...local,
              runClaims: { ...local.runClaims, [request.runId]: claim },
            }),
            claim,
          ] as const;
        });
      }),
    );
  },
  (effect) => localOperation("AgentState.renewRunClaim", effect),
);
