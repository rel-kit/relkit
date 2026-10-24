/**
 * Owns native pending decisions and cancellation listeners for one test agent.
 * Settlement removes its listener before completing the same deferred decision.
 */
import { Deferred, Effect, Ref } from "effect";
import type { AgentApprovalHandler, PendingApproval } from "../index.js";
import type { TestAgentApproval } from "./agents-types.js";
import type { AgentApprovalState, AgentApprovalOwnedState } from "./agent-approvals.types.js";

/** Creates isolated native approval controls.
 * @param choice - Existing fixed, pending or caller-defined policy.
 * @returns Controls retaining selection errors and cancellation behavior.
 */
export function createAgentApprovalState(
  choice: TestAgentApproval | undefined,
): AgentApprovalState {
  const state = Ref.makeUnsafe<AgentApprovalOwnedState>({
    pending: new Map(),
    decisions: new Map(),
    signals: new Map(),
  });
  const handler = approvalHandler(choice, state);
  return Object.freeze({
    ...(handler === undefined ? {} : { handler }),
    pending: () => Object.freeze([...Ref.getUnsafe(state).pending.values()]),
    approve: (id?: string) => resolvePending(state, id, "approved"),
    deny: (id?: string) => resolvePending(state, id, "denied"),
    reset: () => {
      const current = Ref.getUnsafe(state);
      for (const key of [...current.decisions.keys()]) settle(state, key, "denied");
      current.signals.clear();
    },
    registerSignal: (id: string, signal: AbortSignal) =>
      Ref.getUnsafe(state).signals.set(id, signal),
    releaseSignal: (id: string) => {
      Ref.getUnsafe(state).signals.delete(id);
    },
  });
}

/** Selects the existing policy without acquiring a pending decision prematurely.
 * @param choice - Authored policy.
 * @param state - This owner's pending callback state.
 * @returns The same optional approval callback.
 */
function approvalHandler(
  choice: TestAgentApproval | undefined,
  state: Ref.Ref<AgentApprovalOwnedState>,
): AgentApprovalHandler | undefined {
  if (choice === undefined) return undefined;
  if (typeof choice === "function") return choice;
  if (choice !== "pending") return () => choice;
  return (approval) => waitForApproval(state, approval);
}

/** Acquires a deferred decision linked to its invocation's cancellation.
 * @param state - Owner state.
 * @param approval - Canonical pending request.
 * @returns The original native decision Promise.
 */
function waitForApproval(state: Ref.Ref<AgentApprovalOwnedState>, approval: PendingApproval) {
  const current = Ref.getUnsafe(state);
  const key = `${approval.invocationId}:${approval.toolCallId}`;
  const signal = current.signals.get(approval.invocationId);
  const done = Deferred.makeUnsafe<"approved" | "denied">();
  const abort = () => settle(state, key, "denied");
  current.pending.set(key, approval);
  current.decisions.set(key, { done, abort, ...(signal === undefined ? {} : { signal }) });
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  return Effect.runPromise(Deferred.await(done));
}

/** Completes a decision after removing its native callback listener.
 * @param state - Owner state.
 * @param key - Invocation/tool-call identity.
 * @param decision - Canonical native result.
 * @returns Nothing; repeated completion is harmless.
 */
function settle(
  state: Ref.Ref<AgentApprovalOwnedState>,
  key: string,
  decision: "approved" | "denied",
): void {
  const current = Ref.getUnsafe(state);
  const entry = current.decisions.get(key);
  if (entry === undefined) return;
  entry.signal?.removeEventListener("abort", entry.abort);
  current.pending.delete(key);
  current.decisions.delete(key);
  Effect.runSync(Deferred.succeed(entry.done, decision));
}

/** Selects exactly one matching request before settling it once.
 * @param state - Owner state.
 * @param toolCallId - Optional tool-call, tool or resolver identity.
 * @param decision - Canonical result.
 * @returns Nothing after removing the matching resolver.
 */
function resolvePending(
  state: Ref.Ref<AgentApprovalOwnedState>,
  toolCallId: string | undefined,
  decision: "approved" | "denied",
): void {
  const matches = [...Ref.getUnsafe(state).pending.entries()].filter(
    ([key, approval]) =>
      toolCallId === undefined ||
      approval.toolCallId === toolCallId ||
      approval.toolId === toolCallId ||
      key === toolCallId,
  );
  if (matches.length !== 1) throw new Error("Expected exactly one matching pending approval");
  settle(state, matches[0]![0], decision);
}
