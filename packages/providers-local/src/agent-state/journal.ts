import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type { ReadJournalRequest, WaitForJournalRequest } from "@relkit/agents";
import { checkpoint, ownedThread } from "./common.js";
import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";

/**
 * Reads a bounded ordered journal page after the supplied checkpoint.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const readJournal = Effect.fn("AgentState.readJournal")(
  function* (store: AgentStateStore, request: ReadJournalRequest) {
    const operationNow = yield* Clock.currentTimeMillis;

    const state = yield* store.read();
    const local = ownedThread(state, request, request.threadId);
    const foreign =
      request.after.threadId !== request.threadId ||
      request.after.applicationId !== request.applicationId ||
      request.after.environment !== request.environment ||
      request.after.profile !== request.profile;
    const reset = request.after.providerEpoch !== state.providerEpoch;
    const after = Number(request.after.sequence);
    const future = after > local.sequence;
    if (foreign || reset || future) {
      return {
        records: [],
        checkpoint: checkpoint(state, request, request.threadId, local.sequence),
        hasMore: false,
        gap: foreign
          ? ("foreign" as const)
          : reset
            ? ("provider-reset" as const)
            : ("future" as const),
      };
    }
    let bytes = 0;
    const records = local.journal
      .filter((record) => Number(record.checkpoint.sequence) > after)
      .slice(0, request.limit)
      .filter((record) => {
        if (bytes + record.encodedBytes > request.maxEncodedBytes) return false;
        bytes += record.encodedBytes;
        return true;
      });
    const sequence = Number(records.at(-1)?.checkpoint.sequence ?? after);
    return {
      records,
      checkpoint: checkpoint(state, request, request.threadId, sequence),
      hasMore: local.journal.some((record) => Number(record.checkpoint.sequence) > sequence),
    };
  },
  (effect) => localOperation("AgentState.readJournal", effect),
);

/**
 * Waits for journal progress until its deadline, continuity gap or caller cancellation.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @param pollingMs - Maximum interval between shared-state observations.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const waitForJournal = Effect.fn("AgentState.waitForJournal")(
  function* (store: AgentStateStore, request: WaitForJournalRequest, pollingMs: number) {
    const operationNow = yield* Clock.currentTimeMillis;

    while ((yield* Clock.currentTimeMillis) < request.deadlineMs) {
      if (request.signal.aborted)
        return yield* localSync(() => {
          throw request.signal.reason;
        });
      const page = yield* readJournal(store, {
        ...request,
        limit: 1,
        maxEncodedBytes: 256 * 1024,
      });
      if (page.gap !== undefined || page.records.length > 0) return;
      yield* sleep(
        Math.min(pollingMs, request.deadlineMs - (yield* Clock.currentTimeMillis)),
        request.signal,
      );
    }
  },
  (effect) => localOperation("AgentState.waitForJournal", effect),
);

/**
 * Waits within the owning observation fiber.
 * @param milliseconds - Delay before checking shared persisted state again.
 * @param signal - Public cancellation signal checked before waiting.
 * @returns An interruptible delay using the caller's Clock.
 */
export function sleep(milliseconds: number, signal: AbortSignal) {
  return localSync(() => {
    if (signal.aborted) throw signal.reason;
  }).pipe(Effect.andThen(Effect.sleep(Math.max(0, milliseconds))));
}
