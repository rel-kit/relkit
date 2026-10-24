/** Projects tool message parts into stable public event identities in authored order. */
import type { AgentClientEvent, BrowserMessage, JournalRecord } from "@relkit/contracts";
type ClientEventBase = Pick<JournalRecord, "recordId" | "runId" | "checkpoint" | "createdAt">;
type MessagePart = BrowserMessage["parts"][number];

export function toolClientEvents(
  base: ClientEventBase,
  message: BrowserMessage,
): readonly AgentClientEvent[] {
  return message.parts.flatMap((part) => projectToolPart(base, message.messageId, part));
}

function projectToolPart(
  base: ClientEventBase,
  messageId: string,
  part: MessagePart,
): AgentClientEvent[] {
  const eventId = `${base.recordId}:${part.partId}`;
  if (part.kind === "progress") {
    const progress = {
      ...base,
      eventId,
      kind: "progress" as const,
      progressId: part.partId,
      messageId,
      value: part.value,
    };
    return [
      part.scope === "tool"
        ? { ...progress, scope: "tool", toolCallId: part.toolCallId, toolId: part.toolId }
        : { ...progress, scope: "run" },
    ];
  }
  if (part.kind !== "tool") return [];
  const tool = {
    ...base,
    eventId,
    messageId,
    partId: part.partId,
    toolCallId: part.toolCallId,
    toolId: part.toolId,
  };
  switch (part.state) {
    case "started":
      return [{ ...tool, kind: "tool-started" }];
    case "input-streaming":
      return [{ ...tool, kind: "tool-input", input: part.inputText ?? String(part.value ?? "") }];
    case "input-ready":
      return [{ ...tool, kind: "tool-input-ready", input: part.input ?? part.value }];
    case "approval-required":
      return [{ ...tool, kind: "tool-approval-required" }];
    case "running":
      return [{ ...tool, kind: "tool-executing" }];
    case "succeeded":
      return [{ ...tool, kind: "tool-succeeded", output: part.output ?? part.value }];
    case "failed":
      return [{ ...tool, kind: "tool-failed" }];
    case "denied":
      return [{ ...tool, kind: "tool-denied" }];
  }
}
