import { Deferred, Effect, Ref } from "effect";
import type { AgentApprovalHandler, PendingApproval } from "@relkit/agents";
import type { TestAgentApproval } from "./agents-types.js";
import type { AgentApprovalState, PendingAgentDecision } from "./agent-approvals.types.js";

/**
 * Owns pending native approvals and settles each resolver on decision or cancellation.
 * @param choice Existing fixed, pending or caller-defined native approval policy.
 * @returns Isolated controls retaining existing selection errors and decision behavior.
 */
export function createAgentApprovalState(
  choice: TestAgentApproval | undefined,
): AgentApprovalState {
  const state = Ref.makeUnsafe({
    pending: new Map<string, PendingApproval>(),
    decisions: new Map<string, PendingAgentDecision>(),
    signals: new Map<string, AbortSignal>(),
  });
  const handler: AgentApprovalHandler | undefined =
    choice === undefined
      ? undefined
      : typeof choice === "function"
        ? choice
        : choice !== "pending"
          ? () => choice
          : (approval) => {
              const current = Ref.getUnsafe(state);
              const key = `${approval.invocationId}:${approval.toolCallId}`;
              const signal = current.signals.get(approval.invocationId);
              const done = Deferred.makeUnsafe<"approved" | "denied">();
              const abort = () => settle(key, "denied");
              current.pending.set(key, approval);
              current.decisions.set(key, {
                done,
                abort,
                ...(signal === undefined ? {} : { signal }),
              });
              if (signal?.aborted) abort();
              else signal?.addEventListener("abort", abort, { once: true });
              return Effect.runPromise(Deferred.await(done));
            };
  /**
   * Completes the owned decision before removing its native callback listener.
   * @param key Stable invocation/tool-call identity.
   * @param decision Native decision retained by the SDK callback.
   * @returns Nothing; repeated completion is harmless.
   */
  function settle(key: string, decision: "approved" | "denied"): void {
    const current = Ref.getUnsafe(state);
    const entry = current.decisions.get(key);
    if (entry === undefined) return;
    entry.signal?.removeEventListener("abort", entry.abort);
    current.pending.delete(key);
    current.decisions.delete(key);
    Effect.runSync(Deferred.succeed(entry.done, decision));
  }

  /**
   * Selects exactly one matching native pending approval and settles it once.
   * @param toolCallId Optional tool-call, tool or resolver identity.
   * @param decision Native approved/denied decision.
   * @returns Nothing after removing the matching pending resolver.
   */
  function resolvePending(toolCallId: string | undefined, decision: "approved" | "denied"): void {
    const current = Ref.getUnsafe(state);
    const matches = [...current.pending.entries()].filter(
      ([key, approval]) =>
        toolCallId === undefined ||
        approval.toolCallId === toolCallId ||
        approval.toolId === toolCallId ||
        key === toolCallId,
    );
    if (matches.length !== 1) throw new Error("Expected exactly one matching pending approval");
    settle(matches[0]![0], decision);
  }

  return Object.freeze({
    ...(handler === undefined ? {} : { handler }),
    pending: () => Object.freeze([...Ref.getUnsafe(state).pending.values()]),
    approve: (toolCallId?: string) => resolvePending(toolCallId, "approved"),
    deny: (toolCallId?: string) => resolvePending(toolCallId, "denied"),
    reset: () => {
      const current = Ref.getUnsafe(state);
      for (const key of [...current.decisions.keys()]) settle(key, "denied");
      current.signals.clear();
    },
    registerSignal: (id: string, signal: AbortSignal) =>
      Ref.getUnsafe(state).signals.set(id, signal),
    releaseSignal: (id: string) => {
      Ref.getUnsafe(state).signals.delete(id);
    },
  });
}
