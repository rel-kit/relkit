import type { ResolvedAgent } from "./agent-rpc-worker.types.js";

import type { AgentConversationMessage, BrowserMessage } from "@relkit/agents";
import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";

/** Loads compatible completed conversation messages for a new agent turn.
 * @param resolved - Authorized agent descriptor, provider and durable request scope.
 * @param threadId - Stable thread identifier within the authorized agent scope.
 * @returns Completed user and assistant messages mapped through the configured chat fields.
 */
export async function previousMessages(
  resolved: ResolvedAgent,
  threadId: string,
): Promise<readonly AgentConversationMessage[]> {
  const chat = resolved.descriptor.chat;
  if (typeof chat?.input !== "string" || typeof chat.output !== "string") return [];
  const mapping = { input: chat.input, output: chat.output };
  const snapshot = await resolved.provider.loadThread({
    ...resolved.scope,
    threadId,
    maxEncodedBytes: REALTIME_RUNTIME_LIMITS.initialSnapshotBytes,
  });
  return snapshot.currentMessages.flatMap((message) => modelMessage(message, mapping));
}

/** Projects one completed user or assistant message through the configured chat fields.
 * @param message - Public message included in the resulting value or failure.
 * @param chat - Declared input/output fields used to project conversation messages.
 * @returns One model message, or an empty list for tool and incomplete assistant messages.
 */
export function modelMessage(
  message: BrowserMessage,
  chat: { readonly input: string; readonly output: string },
): readonly AgentConversationMessage[] {
  if (message.role !== "user" && message.role !== "assistant") return [];
  const part = message.parts.find(
    (candidate) =>
      candidate.kind === "text" && (message.role === "user" || candidate.state !== "streaming"),
  );
  if (part?.kind !== "text") return [];
  const field = message.role === "user" ? chat.input : chat.output;
  return [{ role: message.role, content: JSON.stringify({ [field]: part.text }) }];
}
