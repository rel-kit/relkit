import type {
  BrowserMessage,
  ListThreadsRequest,
  ThreadList,
  ThreadListItem,
} from "@relkit/agents";
import { LocalAgentStateError, scopeKey } from "./common.js";
import type { AgentStateStore } from "./storage.js";

export async function listThreads(
  store: AgentStateStore,
  request: ListThreadsRequest,
): Promise<ThreadList> {
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100)
    throw new RangeError("Thread list limit must be between 1 and 100.");
  const state = await store.read();
  if (request.providerEpoch !== state.providerEpoch)
    throw new LocalAgentStateError("PROVIDER_STATE_LOST", "Agent provider epoch changed.");
  return {
    threads: Object.values(state.threads)
      .filter((item) => item.scopeKey === scopeKey(request))
      .sort((left, right) => right.thread.updatedAt.localeCompare(left.thread.updatedAt))
      .slice(0, request.limit)
      .map(summary),
  };
}

function summary(local: Awaited<ReturnType<AgentStateStore["read"]>>["threads"][string]) {
  const text = latestUserText(local.messages);
  return {
    ...local.thread,
    ...(text === undefined ? {} : { preview: text.slice(0, 160) }),
  } satisfies ThreadListItem;
}

function latestUserText(messages: readonly BrowserMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    return message.parts.find((part) => part.kind === "text")?.text;
  }
  return undefined;
}
