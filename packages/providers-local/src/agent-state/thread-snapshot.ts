import type {
  CreateThreadReceipt,
  LoadThreadRequest,
  ThreadSnapshot,
  StoredRun,
} from "@relkit/agents";
import { checkpoint, ownedThread } from "./common.js";
import { journalProjection } from "./snapshot-projection.js";

/**
 * Projects an accepted thread creation into its public receipt.
 * @param thread - Current persisted thread.
 * @returns The public acceptance receipt.
 */
export function receipt(thread: {
  readonly threadId: string;
  readonly ownerScope: string;
  readonly createdAt: string;
}): CreateThreadReceipt {
  return { threadId: thread.threadId, ownerScope: thread.ownerScope, createdAt: thread.createdAt };
}

/**
 * Combines thread, messages, approvals and execution projection into a persisted snapshot.
 * @param state - Persisted domain snapshot.
 * @param request - Validated domain request and scope.
 * @param local - Thread state owned by the current transaction.
 * @param snapshotId - Persisted snapshot identity.
 * @param firstCurrent - Initial state captured before processing.
 * @returns The immutable state snapshot.
 */
export function makeSnapshot(
  state: import("./state.js").LocalAgentState,
  request: LoadThreadRequest,
  local: ReturnType<typeof ownedThread>,
  snapshotId: string,
  firstCurrent: number,
): ThreadSnapshot {
  const hasOlderHistory = firstCurrent > 0;
  return {
    snapshotId,
    thread: local.thread,
    activeRun:
      local.activeRunId === undefined ? undefined : routing(local.runs[local.activeRunId]!),
    currentRuns: Object.values(local.runs).map(publicRun),
    currentMessages: local.messages.slice(firstCurrent),
    ...journalProjection(local),
    approvals: local.approvals,
    controls: Object.values(local.controls).map((item) => item.record),
    ...(local.waiting === undefined ? {} : { waiting: local.waiting }),
    checkpoint: checkpoint(state, request, request.threadId, local.sequence),
    providerEpoch: state.providerEpoch,
    hasOlderHistory,
    ...(hasOlderHistory ? { olderHistoryCursor: "0" } : {}),
  };
}

/**
 * Projects optional thread routing fields without inventing missing identifiers.
 * @param run - Current persisted run.
 * @returns The optional routing fields present in the persisted thread.
 */
export function routing(run: StoredRun) {
  return { runId: run.runId, threadId: run.threadId, owner: run.owner };
}

/**
 * Projects persisted run fields into the public run representation.
 * @param run - Current persisted run.
 * @returns The public run projection.
 */
export function publicRun(run: StoredRun): StoredRun {
  return {
    ...routing(run),
    operationId: run.operationId,
    status: run.status,
    inputDigest: run.inputDigest,
    acceptedAt: run.acceptedAt,
    ...(run.settledAt === undefined ? {} : { settledAt: run.settledAt }),
    ...(run.outcome === undefined ? {} : { outcome: run.outcome }),
  };
}
