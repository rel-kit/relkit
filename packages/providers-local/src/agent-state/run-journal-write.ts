import { Clock, Effect } from "effect";
import { localOperation, localSync } from "../local-effect.js";
import type { AppendJournalRequest } from "@relkit/agents";
import {
  activeClaim,
  checkpoint,
  encodedBytes,
  LocalAgentStateError,
  ownedThread,
} from "./common.js";
import { replaceThread } from "./run-state.js";
import type { LocalAgentThread } from "./state.js";
import type { AgentStateStoreEffects as AgentStateStore } from "./storage.js";

/**
 * Appends public journal content and updates materialized messages or approvals atomically.
 * @param store - Atomic snapshot operations supplied by the owning service.
 * @param request - Scoped operation input, identity and capacity or pagination policy.
 * @returns A lazy operation yielding the domain result or LocalOperationError.
 * @remarks State changes commit atomically before acknowledgement.
 */
export const appendJournal = Effect.fn("AgentState.appendJournal")(
  function* (store: AgentStateStore, request: AppendJournalRequest) {
    const operationNow = yield* Clock.currentTimeMillis;
    return yield* Effect.flatten(
      localSync(() => {
        return store.update((state) => {
          const local = ownedThread(state, request, request.threadId);
          activeClaim(local.runClaims[request.runId], request.claim, operationNow);
          if (
            request.record.encodedBytes > request.limits.maxJournalRecordBytes ||
            encodedBytes(request.record) > request.limits.maxJournalRecordBytes
          )
            throw new LocalAgentStateError(
              "AGENT_OUTPUT_TOO_LARGE",
              "Journal record is too large.",
            );
          const sequence = local.sequence + 1;
          const record = {
            ...request.record,
            checkpoint: checkpoint(state, request, request.threadId, sequence),
          };
          const journal = [...local.journal, record];
          if (
            journal.reduce((sum, item) => sum + item.encodedBytes, 0) >
            request.limits.maxJournalBytesPerThread - request.limits.terminalReserveBytes
          )
            throw new LocalAgentStateError(
              "AGENT_JOURNAL_OVERLOADED",
              "Agent journal capacity is full.",
            );
          const approvals =
            record.kind === "approval"
              ? upsertApproval(local.approvals, record.publicValue)
              : local.approvals;
          const messages =
            record.kind === "message"
              ? upsertMessage(local.messages, record.publicValue)
              : local.messages;
          const interrupted =
            record.kind === "approval" && approvalSetComplete(approvals, record.publicValue);
          const run = local.runs[request.runId];
          return [
            replaceThread(state, request.threadId, {
              ...local,
              sequence,
              journal,
              approvals,
              messages,
              ...(interrupted && run !== undefined
                ? {
                    runs: {
                      ...local.runs,
                      [request.runId]: { ...run, status: "approval-interrupted" as const },
                    },
                    thread: {
                      ...local.thread,
                      status: "approval-interrupted" as const,
                      updatedAt: record.createdAt,
                      revision: String(Number(local.thread.revision) + 1),
                    },
                  }
                : {}),
            }),
            { recordId: record.recordId, checkpoint: record.checkpoint, duplicate: false },
          ] as const;
        });
      }),
    );
  },
  (effect) => localOperation("AgentState.appendJournal", effect),
);

/**
 * Checks whether every approval required by a waiting run has a decision.
 * @param approvals - Current approval collection.
 * @param value - Untrusted or projected value to inspect.
 * @returns Whether all required approval decisions are present.
 */
function approvalSetComplete(approvals: LocalAgentThread["approvals"], value: unknown): boolean {
  const approval = value as { interruptSetDigest?: unknown; interruptSetSize?: unknown };
  if (approval.interruptSetSize === undefined) return true;
  return (
    typeof approval.interruptSetSize === "number" &&
    Number.isInteger(approval.interruptSetSize) &&
    approval.interruptSetSize > 0 &&
    approvals.filter((item) => item.interruptSetDigest === approval.interruptSetDigest).length ===
      approval.interruptSetSize
  );
}

/**
 * Replaces an approval by identity while retaining unrelated approvals.
 * @param approvals - Current approval collection.
 * @param value - Untrusted or projected value to inspect.
 * @returns The approval collection with the matching identity replaced.
 */
function upsertApproval(approvals: LocalAgentThread["approvals"], value: unknown) {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof (value as { approvalId?: unknown }).approvalId !== "string"
  )
    throw new LocalAgentStateError("INVALID_APPROVAL", "Approval journal record is invalid.");
  const approval = value as LocalAgentThread["approvals"][number];
  return [...approvals.filter((item) => item.approvalId !== approval.approvalId), approval];
}

/**
 * Replaces a browser message by identity while retaining unrelated messages.
 * @param messages - Current message collection.
 * @param value - Untrusted or projected value to inspect.
 * @returns The message collection with the matching identity replaced.
 */
function upsertMessage(messages: LocalAgentThread["messages"], value: unknown) {
  if (!isBrowserMessage(value))
    throw new LocalAgentStateError("INVALID_MESSAGE", "Message journal record is invalid.");
  const index = messages.findIndex((item) => item.messageId === value.messageId);
  if (index === -1) return [...messages, value];
  return messages.map((message, current) => (current === index ? value : message));
}

/**
 * Checks the runtime shape required before projecting a browser message.
 * @param value - Untrusted or projected value to inspect.
 * @returns Whether the value satisfies the browser-message shape.
 */
function isBrowserMessage(value: unknown): value is LocalAgentThread["messages"][number] {
  if (value === null || typeof value !== "object") return false;
  const message = value as {
    messageId?: unknown;
    role?: unknown;
    parts?: unknown;
    createdAt?: unknown;
  };
  return (
    typeof message.messageId === "string" &&
    (message.role === "user" || message.role === "assistant" || message.role === "tool") &&
    Array.isArray(message.parts) &&
    typeof message.createdAt === "string"
  );
}
