/** Owns local agent-state run interruption without changing persisted format. */
import type { LocalAgentState, LocalAgentThread, LocalStoredRun } from "./state.js";

import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type { InterruptOwnedRunRequest, InterruptionReceipt } from "@relkit/contracts";
import { checkpoint, encodedBytes, ownedThread } from "./common.js";
import { replaceThread, requireRun } from "./run-state.js";
import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";

/**
 * Marks a worker interruption while retaining durable replay state.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const interruptRun = Effect.fn("AgentState.interruptRun")(
  function* (store: AgentStateStore, request: InterruptOwnedRunRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return store.update((state) => {
          const local = ownedThread(state, request, request.threadId);
          const run = requireRun(local, request.runId);
          /**
           * Projects the already-settled run without committing another transition.
           * @returns The retained run state and its existing result.
           */
          const unchanged = (): readonly [typeof state, InterruptionReceipt] => [
            state,
            {
              threadId: request.threadId,
              runId: request.runId,
              status: "worker-interrupted",
              checkpoint: checkpoint(state, request, request.threadId, local.sequence),
              changed: false,
            },
          ];
          if (["succeeded", "failed", "cancelled", "worker-interrupted"].includes(run.status))
            return unchanged();
          const claim = local.runClaims[request.runId];
          if (
            claim?.claimId !== request.expectedClaimId ||
            claim.fence !== request.expectedFence ||
            run.owner.generationId !== request.expectedOwner.generationId
          )
            return unchanged();
          return commitInterruption(state, local, run, request);
        });
      }),
    );
  },
  (effect) => localOperation("AgentState.interruptRun", effect),
);

/**
 * Projects a fenced worker interruption and its journal record.
 * @param state - Snapshot supplied by the owning atomic store update.
 * @param local - Owned thread projected from the same snapshot.
 * @param run - Existing persisted run whose execution ownership was checked by the caller.
 * @param request - Validated scoped request, including operation identity and capacity policy.
 * @returns The next snapshot and changed interruption receipt sharing one checkpoint.
 */
export function commitInterruption(
  state: LocalAgentState,
  local: LocalAgentThread,
  run: LocalStoredRun,
  request: InterruptOwnedRunRequest,
) {
  const sequence = local.sequence + 1;
  const point = checkpoint(state, request, request.threadId, sequence);
  const record = {
    recordId: request.operationId,
    runId: request.runId,
    kind: "interruption" as const,
    publicValue: { reason: request.reason },
    encodedBytes: encodedBytes(request.reason),
    createdAt: request.interruptedAt,
    checkpoint: point,
  };
  return [
    replaceThread(state, request.threadId, {
      ...local,
      sequence,
      activeRunId: request.runId,
      journal: [...local.journal, record],
      runs: {
        ...local.runs,
        [request.runId]: {
          ...run,
          status: "worker-interrupted",
          outcome: "worker-interrupted",
          settledAt: request.interruptedAt,
        },
      },
      thread: {
        ...local.thread,
        status: "worker-interrupted",
        updatedAt: request.interruptedAt,
      },
    }),
    {
      threadId: request.threadId,
      runId: request.runId,
      status: "worker-interrupted",
      checkpoint: point,
      changed: true,
    },
  ] as const;
}
