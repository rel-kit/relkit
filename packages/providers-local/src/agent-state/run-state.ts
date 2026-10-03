import { nativeNow } from "../native-services.js";
import type { AgentRequestScope } from "@relkit/agents";
import { LocalAgentStateError, ownedThread, storedThreadKey } from "./common.js";
import type { LocalAgentState, LocalAgentThread } from "./state.js";

/**
 * Resolves a run owned by the thread or rejects with a not-found error.
 * @param local - Thread state owned by the current transaction.
 * @param runId - Run identity within the thread.
 * @returns The requested run after existence checks.
 */
export function requireRun(local: LocalAgentThread, runId: string) {
  const run = local.runs[runId];
  if (run === undefined) throw new LocalAgentStateError("NOT_FOUND", "Run was not found.");
  return run;
}

/**
 * Replaces one scoped thread and advances the global persisted revision.
 * @param state - Persisted domain snapshot.
 * @param threadId - Thread identity within the scope.
 * @param thread - Current persisted thread.
 * @returns The state with the scoped thread replaced and revision advanced.
 */
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

/**
 * Returns a running thread to idle only after active work and follow-ups are absent.
 * @param state - Persisted domain snapshot.
 * @param scope - Application, environment and caller scope.
 * @param threadId - Thread identity within the scope.
 * @returns The unchanged state or an idle-thread transition when all work has settled.
 */
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
      updatedAt: new Date(nativeNow()).toISOString(),
      revision: String(Number(local.thread.revision) + 1),
    },
  });
}
