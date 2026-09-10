import type { SuspensionReceipt, SuspendRunRequest } from "@relkit/agents";
import {
  activeClaim,
  checkpoint,
  encodedBytes,
  LocalAgentStateError,
  ownedThread,
} from "./common.js";
import { replaceThread, requireRun } from "./run-state.js";
import type { AgentStateStore } from "./storage.js";

export function suspendRun(
  store: AgentStateStore,
  request: SuspendRunRequest,
): Promise<SuspensionReceipt> {
  return store.update((state) => {
    const local = ownedThread(state, request, request.threadId);
    activeClaim(local.runClaims[request.runId], request.claim);
    const run = requireRun(local, request.runId);
    if (run.status !== "running") {
      throw new LocalAgentStateError("INVALID_RUN_STATE", "Only a running run can be suspended.");
    }
    if (request.waiting.runId !== request.runId) {
      throw new LocalAgentStateError(
        "INVALID_WAITING_STATE",
        "Waiting state belongs to another run.",
      );
    }
    const revision = String(Number(local.thread.revision) + 1);
    const waiting = { ...request.waiting, revision };
    const sequence = local.sequence + 1;
    const point = checkpoint(state, request, request.threadId, sequence);
    const record = {
      recordId: request.operationId,
      runId: request.runId,
      kind: "interruption" as const,
      publicValue: waiting,
      checkpoint: point,
      encodedBytes: encodedBytes(waiting),
      createdAt: request.suspendedAt,
    };
    assertCapacity(local.journal, Math.max(record.encodedBytes, encodedBytes(record)), run);
    const { [request.runId]: _claim, ...runClaims } = local.runClaims;
    const next = replaceThread(state, request.threadId, {
      ...local,
      sequence,
      waiting,
      journal: [...local.journal, record],
      runClaims,
      runs: {
        ...local.runs,
        [request.runId]: { ...run, status: "waiting" },
      },
      thread: {
        ...local.thread,
        status: "waiting",
        updatedAt: request.suspendedAt,
        revision,
      },
    });
    return [
      next,
      {
        threadId: request.threadId,
        runId: request.runId,
        status: "waiting",
        checkpoint: point,
        waiting,
      },
    ] as const;
  });
}

function assertCapacity(
  journal: readonly { readonly encodedBytes: number }[],
  recordBytes: number,
  run: {
    readonly maxJournalRecordBytes: number;
    readonly maxJournalBytes: number;
    readonly terminalReserveBytes: number;
  },
): void {
  if (recordBytes > run.maxJournalRecordBytes) {
    throw new LocalAgentStateError("AGENT_OUTPUT_TOO_LARGE", "Waiting state is too large.");
  }
  const used = journal.reduce((sum, item) => sum + item.encodedBytes, 0);
  if (used + recordBytes > run.maxJournalBytes - run.terminalReserveBytes) {
    throw new LocalAgentStateError("AGENT_JOURNAL_OVERLOADED", "Agent journal capacity is full.");
  }
}
