import type { ThreadSnapshot } from "@relkit/contracts";
import type { AgentThreadOptions } from "./agent-hook-types.js";
import { procedureCall } from "./procedure.js";

interface PreparedContinuation {
  readonly waitingRevision: string;
  readonly digestValue: { readonly payload: unknown; readonly waitingRevision: string };
}

export async function prepareAgentContinuation(
  client: unknown,
  agentId: string,
  threadId: string,
  payload: unknown,
  current?: ThreadSnapshot,
): Promise<PreparedContinuation> {
  const snapshot =
    current?.thread.threadId === threadId && current.waiting !== undefined
      ? current
      : ((await procedureCall(
          client,
          "relkit.agent.load",
        )({ agentId, threadId })) as ThreadSnapshot);
  if (snapshot.waiting === undefined) throw new Error("Graph has no waiting continuation.");
  const waitingRevision = snapshot.waiting.revision;
  return { waitingRevision, digestValue: { payload, waitingRevision } };
}

export function requiredThreadId(options: AgentThreadOptions | undefined): string {
  if (!options?.threadId || options.threadId !== options.threadId.trim())
    throw new Error("threadId must be a non-empty string without surrounding whitespace.");
  return options.threadId;
}
