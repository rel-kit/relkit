import type { AgentRequestScope } from "@relkit/agents";
import { LocalAgentStateError, ownedThread, storedThreadKey } from "./common.js";
import type { LocalAgentState, LocalAgentThread } from "./state.js";

export function requireRun(local: LocalAgentThread, runId: string) {
  const run = local.runs[runId];
  if (run === undefined) throw new LocalAgentStateError("NOT_FOUND", "Run was not found.");
  return run;
}

export function replaceThread(
  state: LocalAgentState,
  threadId: string,
  thread: LocalAgentThread,
): LocalAgentState {
  return {
    ...state,
    revision: state.revision + 1,
    threads: { ...state.threads, [storedThreadKey(thread.scopeKey, threadId)]: thread },
  };
}

export function settleIdleThread(
  state: LocalAgentState,
  scope: AgentRequestScope,
  threadId: string,
): LocalAgentState {
  const local = ownedThread(state, scope, threadId);
  const queued = Object.values(local.controls).some(
    (item) =>
      item.record.kind === "follow-up" &&
      (item.receipt.status === "accepted" || item.receipt.status === "processing"),
  );
  if (local.activeRunId !== undefined || queued || local.thread.status !== "running") return state;
  return replaceThread(state, threadId, {
    ...local,
    thread: {
      ...local.thread,
      status: "idle",
      updatedAt: new Date().toISOString(),
      revision: String(Number(local.thread.revision) + 1),
    },
  });
}
