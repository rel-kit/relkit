import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type { BrowserMessage, ListThreadsRequest, ThreadListItem } from "@relkit/agents";
import { LocalAgentStateError, scopeKey } from "./common.js";
import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";

/**
 * Selects scoped threads in stable order with an optional status filter.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const listThreads = Effect.fn("AgentState.listThreads")(
  function* (store: AgentStateStore, request: ListThreadsRequest) {
    const operationNow = yield* Clock.currentTimeMillis;

    if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100)
      return yield* localSync(() => {
        throw new RangeError("Thread list limit must be between 1 and 100.");
      });
    const state = yield* store.read();
    if (request.providerEpoch !== state.providerEpoch)
      return yield* localSync(() => {
        throw new LocalAgentStateError("PROVIDER_STATE_LOST", "Agent provider epoch changed.");
      });
    return {
      threads: Object.values(state.threads)
        .filter((item) => item.scopeKey === scopeKey(request))
        .sort((left, right) => right.thread.updatedAt.localeCompare(left.thread.updatedAt))
        .slice(0, request.limit)
        .map(summary),
    };
  },
  (effect) => localOperation("AgentState.listThreads", effect),
);

/**
 * Builds the bounded thread-list representation from persisted thread state.
 * @param local - Thread state owned by the current transaction.
 * @returns The bounded thread-list record.
 */
function summary(local: import("./state.js").LocalAgentState["threads"][string]) {
  const text = latestUserText(local.messages);
  return {
    ...local.thread,
    ...(text === undefined ? {} : { preview: text.slice(0, 160) }),
  } satisfies ThreadListItem;
}

/**
 * Selects the latest user text used by thread-list previews.
 * @param messages - Current message collection.
 * @returns The latest available user text preview.
 */
function latestUserText(messages: readonly BrowserMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    return message.parts.find((part) => part.kind === "text")?.text;
  }
  return undefined;
}
