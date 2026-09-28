import type {
  AgentClientEvent,
  AgentExecutionEvent,
  BrowserMessage,
  JournalRecord,
} from "@relkit/contracts";
import { Effect, Metric } from "effect";
import { observeAgent } from "./agent-telemetry.js";
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
export const agentClientEventsEffect = Effect.fn("Agents.clientEvents.project")(function* (
  record: JournalRecord,
) {
  yield* Metric.update(clientEventsCount, 1);
  return yield* Effect.sync(() => projectClientEvents(record));
}, (effect) => observeAgent("client-events.project", effect));

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
  if (record.kind !== "message") {
    if (record.kind === "event") {
      return [
        {
          ...base,
          eventId: record.recordId,
          kind: "execution-event",
          value: record.publicValue as AgentExecutionEvent,
        },
      ];
    }
    if (record.kind === "progress") {
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
      record.kind === "terminal"
        ? "run-finished"
        : record.kind === "interruption"
          ? "run-interrupted"
          : record.kind;
    return [{ ...base, eventId: record.recordId, kind, value: record.publicValue }];
  }
  const message = browserMessage(record.publicValue);
  if (message === undefined) return [];
  if (message.role !== "tool") {
    return [{ ...base, eventId: `${record.recordId}:message`, kind: "message-updated", message }];
  }
  const events: AgentClientEvent[] = [];
  for (const part of message.parts) {
    const eventId = `${record.recordId}:${part.partId}`;
    if (part.kind === "progress") {
      const progress = {
        ...base,
        eventId,
        kind: "progress" as const,
        progressId: part.partId,
        messageId: message.messageId,
        value: part.value,
      };
      events.push(
        part.scope === "tool"
          ? {
              ...progress,
              scope: "tool",
              toolCallId: part.toolCallId,
              toolId: part.toolId,
            }
          : { ...progress, scope: "run" },
      );
      continue;
    }
    if (part.kind !== "tool") continue;
    const tool = {
      ...base,
      eventId,
      messageId: message.messageId,
      partId: part.partId,
      toolCallId: part.toolCallId,
      toolId: part.toolId,
    };
    switch (part.state) {
      case "started":
        events.push({ ...tool, kind: "tool-started" });
        break;
      case "input-streaming":
        events.push({
          ...tool,
          kind: "tool-input",
          input: part.inputText ?? String(part.value ?? ""),
        });
        break;
      case "input-ready":
        events.push({ ...tool, kind: "tool-input-ready", input: part.input ?? part.value });
        break;
      case "approval-required":
        events.push({ ...tool, kind: "tool-approval-required" });
        break;
      case "running":
        events.push({ ...tool, kind: "tool-executing" });
        break;
      case "succeeded":
        events.push({ ...tool, kind: "tool-succeeded", output: part.output ?? part.value });
        break;
      case "failed":
        events.push({ ...tool, kind: "tool-failed" });
        break;
      case "denied":
        events.push({ ...tool, kind: "tool-denied" });
        break;
    }
  }
  return events;
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
