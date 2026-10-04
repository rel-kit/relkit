import { runExecutionPromise } from "@relkit/contracts/operation";
import { agentOperations, agentRuntime } from "./agent-runtime.js";

/**
 * Reconciles recorded submissions using authoritative receipt lookup.
 * @param client - Finite procedure client.
 * @param scopeKey - Complete identity scope key.
 * @param agentId - Declared agent identity.
 * @param signal - Caller cancellation authority.
 * @returns The first recovered thread, preserving existing receipt order.
 */
export function reconcileAgentRun(
  client: unknown,
  scopeKey: string,
  agentId: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  return runExecutionPromise(
    agentRuntime,
    agentOperations.reconcile(client, scopeKey, agentId, signal),
    { signal },
  );
}
