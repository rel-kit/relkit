import type { ThreadSnapshot } from "@relkit/contracts";
import type { AgentThreadOptions } from "./agent-hook-types.types.js";
import { runExecutionPromise } from "@relkit/contracts/operation";
import { agentOperations, agentRuntime } from "./agent-runtime.js";
import type { PreparedContinuation } from "./agent-operations.types.js";

/**
 * Binds a continuation to the authoritative waiting revision for its thread.
 * @param client - Finite procedure client.
 * @param agentId - Declared agent.
 * @param threadId - Caller-owned thread.
 * @param payload - Transmitted continuation input.
 * @param current - Borrowed snapshot, reused only for the same waiting thread.
 * @returns Revision and digest input, retaining original Promise failures.
 */
export function prepareAgentContinuation(
  client: unknown,
  agentId: string,
  threadId: string,
  payload: unknown,
  current?: ThreadSnapshot,
): Promise<PreparedContinuation> {
  return runExecutionPromise(
    agentRuntime,
    agentOperations.continuation(client, agentId, threadId, payload, current),
  );
}

/**
 * Validates the existing caller-supplied thread boundary.
 * @param options - Public thread options.
 * @returns The original nonempty, unpadded thread identity.
 * @throws Error when the existing thread validation fails.
 */
export function requiredThreadId(options: AgentThreadOptions | undefined): string {
  if (!options?.threadId || options.threadId !== options.threadId.trim())
    throw new Error("threadId must be a non-empty string without surrounding whitespace.");
  return options.threadId;
}
