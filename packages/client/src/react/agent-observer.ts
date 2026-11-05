import { agentOperations } from "./agent-operations.service.js";
import type { AgentIdentity, AgentUpdate } from "./agent-operations.types.js";

/**
 * Restores and observes one caller-owned thread until terminal evidence or cleanup.
 * @typeParam Output - Declared agent output.
 * @param client - Finite procedure client.
 * @param streamClient - Observation procedure client.
 * @param agentId - Declared agent.
 * @param threadId - Caller-owned thread.
 * @param identity - Existing expected identity authority.
 * @param signal - View cleanup signal; accepted server work remains independent.
 * @param update - Borrowed state publication callback.
 * @returns Observation completion, retaining the existing resolved-on-abort contract.
 */
export function restoreAndObserve<Output>(
  client: unknown,
  streamClient: unknown,
  agentId: string,
  threadId: string,
  identity: AgentIdentity | undefined,
  signal: AbortSignal,
  update: AgentUpdate<Output>,
): Promise<void> {
  return agentOperations
    .observe(client, streamClient, agentId, threadId, identity, signal, update)
    .catch((error: unknown) => {
      if (!signal.aborted) throw error;
    });
}
