/** Projects durable agent journal records into bounded client lifecycle events while preserving tool identity and declared public values. */

import type {
  AgentClientEvent,
  AgentExecutionEvent,
  BrowserMessage,
  JournalRecord,
} from "@relkit/contracts";
import { Effect, Metric } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { toolClientEvents } from "./client-tool-events.js";
export type { AgentClientEvent, AgentProgressEvent, AgentToolEvent } from "@relkit/contracts";

const clientEventsCount = Metric.counter("relkit.agents.client_events.project.total");

/**
 * Projects one journal record into ordered, public client events.
 *
 * @param record - Journal record to project.
 * @returns An Effect with zero or more client events; it has no typed failure.
 * @example
 * const events = Effect.runSync(agentClientEventsEffect(record));
 */
export const agentClientEventsEffect = Effect.fn("Agents.clientEvents.project")(
  function* (record: JournalRecord) {
    yield* Metric.update(clientEventsCount, 1);
    return yield* Effect.sync(() => projectClientEvents(record));
  },
  (effect) => observeAgent("client-events.project", effect),
);

/**
 * Projects a journal record for existing synchronous client callers.
 *
 * @param record - Journal record to project.
 * @returns Ordered client events, or an empty array for an invalid message.
 * @example
 * const events = agentClientEvents(record);
 */
export function agentClientEvents(record: JournalRecord): readonly AgentClientEvent[] {
  return Effect.runSync(agentClientEventsEffect(record));
}

function projectClientEvents(record: JournalRecord): readonly AgentClientEvent[] {
  const base = {
    recordId: record.recordId,
    runId: record.runId,
    checkpoint: record.checkpoint,
    createdAt: record.createdAt,
  };
  if (record.kind !== "message") return nonMessageClientEvents(record, base, record.kind);
  const message = browserMessage(record.publicValue);
  if (message === undefined) return [];
  return message.role === "tool"
    ? toolClientEvents(base, message)
    : [{ ...base, eventId: `${record.recordId}:message`, kind: "message-updated", message }];
}

function nonMessageClientEvents(
  record: JournalRecord,
  base: Pick<JournalRecord, "recordId" | "runId" | "checkpoint" | "createdAt">,
  recordKind: Exclude<JournalRecord["kind"], "message">,
): readonly AgentClientEvent[] {
  if (recordKind === "event") {
    return [
      {
        ...base,
        eventId: record.recordId,
        kind: "execution-event",
        value: record.publicValue as AgentExecutionEvent,
      },
    ];
  }
  if (recordKind === "progress") {
    return [
      {
        ...base,
        eventId: record.recordId,
        kind: "progress",
        scope: "run",
        progressId: record.recordId,
        value: record.publicValue,
      },
    ];
  }
  const kind =
    recordKind === "terminal"
      ? "run-finished"
      : recordKind === "interruption"
        ? "run-interrupted"
        : recordKind;
  return [{ ...base, eventId: record.recordId, kind, value: record.publicValue }];
}
function browserMessage(value: unknown): BrowserMessage | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const message = value as Partial<BrowserMessage>;
  return typeof message.messageId === "string" &&
    (message.role === "user" || message.role === "assistant" || message.role === "tool") &&
    Array.isArray(message.parts) &&
    typeof message.createdAt === "string"
    ? (message as BrowserMessage)
    : undefined;
}
