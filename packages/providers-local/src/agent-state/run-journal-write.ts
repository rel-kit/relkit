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
import type { AgentStateStore } from "./storage.js";

export function appendJournal(store: AgentStateStore, request: AppendJournalRequest) {
  return store.update((state) => {
    const local = ownedThread(state, request, request.threadId);
    activeClaim(local.runClaims[request.runId], request.claim);
    if (
      request.record.encodedBytes > request.limits.maxJournalRecordBytes ||
      encodedBytes(request.record) > request.limits.maxJournalRecordBytes
    )
      throw new LocalAgentStateError("AGENT_OUTPUT_TOO_LARGE", "Journal record is too large.");
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
      throw new LocalAgentStateError("AGENT_JOURNAL_OVERLOADED", "Agent journal capacity is full.");
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
}

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

function upsertMessage(messages: LocalAgentThread["messages"], value: unknown) {
  if (!isBrowserMessage(value))
    throw new LocalAgentStateError("INVALID_MESSAGE", "Message journal record is invalid.");
  const index = messages.findIndex((item) => item.messageId === value.messageId);
  if (index === -1) return [...messages, value];
  return messages.map((message, current) => (current === index ? value : message));
}

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
