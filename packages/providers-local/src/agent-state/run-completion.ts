/** Validates completion receipts, execution claims and terminal capacity before atomic settlement. */
import { commitCompletion } from "./run-terminal-projection.js";
import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type { CompleteRunRequest } from "@relkit/contracts";
import {
  activeClaim,
  assertOperationReceiptFresh,
  encodedBytes,
  LocalAgentStateError,
  lookupReceipt,
  operationStorageKey,
  ownedThread,
} from "./common.js";
import { requireRun } from "./run-state.js";
import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";

/**
 * Commits a terminal run record and idempotent completion receipt together.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const completeRun = Effect.fn("AgentState.completeRun")(
  function* (store: AgentStateStore, request: CompleteRunRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return store.update((state) => {
          const local = ownedThread(state, request, request.threadId);
          const prior = lookupReceipt(
            state.runReceipts[operationStorageKey(request, request.operationId)],
            request.semanticDigest,
            request.settledAt,
          );
          if (prior !== undefined && prior !== "expired" && "checkpoint" in prior)
            return [state, { ...prior, duplicate: true }] as const;
          if (prior === "expired")
            throw new LocalAgentStateError(
              "IDEMPOTENCY_WINDOW_EXPIRED",
              "Completion receipt expired.",
            );
          assertOperationReceiptFresh(request.operationId, request.settledAt);
          activeClaim(local.runClaims[request.runId], request.claim, operationNow);
          const run = requireRun(local, request.runId);
          assertTerminalCapacity(local.journal, request.terminalRecord, run);
          return commitCompletion(state, local, run, request);
        });
      }),
    );
  },
  (effect) => localOperation("AgentState.completeRun", effect),
);

/**
 * Checks that final run settlement fits the retained journal and snapshot limits.
 * @param journal - Ordered persisted journal.
 * @param run - Current persisted run.
 * @param terminal - Terminal outcome to persist.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
function assertTerminalCapacity(
  journal: readonly { readonly encodedBytes: number }[],
  terminal: { readonly encodedBytes: number },
  run: {
    readonly maxJournalRecordBytes: number;
    readonly terminalReserveBytes: number;
    readonly maxJournalBytes: number;
  },
): void {
  if (
    terminal.encodedBytes > run.maxJournalRecordBytes ||
    encodedBytes(terminal) > run.maxJournalRecordBytes
  )
    throw new LocalAgentStateError("AGENT_OUTPUT_TOO_LARGE", "Terminal record is too large.");
  if (terminal.encodedBytes > run.terminalReserveBytes)
    throw new LocalAgentStateError(
      "AGENT_TERMINAL_RESERVE_EXCEEDED",
      "Terminal record exceeds the reserved capacity.",
    );
  if (
    journal.reduce((sum, record) => sum + record.encodedBytes, 0) + terminal.encodedBytes >
    run.maxJournalBytes
  )
    throw new LocalAgentStateError("AGENT_JOURNAL_OVERLOADED", "Agent journal capacity is full.");
}
