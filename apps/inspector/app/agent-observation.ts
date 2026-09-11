import type {
  AgentClientEvent,
  AgentObservation,
  BrowserMessage,
  BrowserMessagePart,
  ThreadSnapshot,
  ToolPartState,
} from "./application-runtime-types";
import { executionUpdate } from "./agent-execution-observation";

export interface AgentConversationState {
  readonly snapshot?: ThreadSnapshot;
  readonly messages: readonly BrowserMessage[];
  readonly events: readonly AgentClientEvent[];
}

export const emptyAgentConversation: AgentConversationState = { messages: [], events: [] };

export function conversationFromSnapshot(snapshot: ThreadSnapshot): AgentConversationState {
  return { snapshot, messages: snapshot.currentMessages, events: [] };
}

export function applyAgentObservation(
  current: AgentConversationState,
  observation: AgentObservation,
): AgentConversationState {
  if (observation.kind === "snapshot" || observation.kind === "gap") {
    return {
      snapshot: observation.snapshot,
      messages: observation.snapshot.currentMessages,
      events: current.events,
    };
  }
  const event = observation.event;
  if (current.events.some((candidate) => candidate.eventId === event.eventId)) return current;
  const messages = applyEvent(current.messages, event);
  return {
    ...(current.snapshot === undefined
      ? {}
      : {
          snapshot: {
            ...current.snapshot,
            currentMessages: messages,
            checkpoint: event.checkpoint,
            ...(event.kind === "execution-event"
              ? executionUpdate(current.snapshot, event.value)
              : {}),
          },
        }),
    messages,
    events: [...current.events.slice(-99), event],
  };
}

function applyEvent(
  messages: readonly BrowserMessage[],
  event: AgentClientEvent,
): readonly BrowserMessage[] {
  if (event.kind === "message-updated") return upsertMessage(messages, event.message);
  if (event.kind === "progress" && event.messageId !== undefined) {
    return upsertPart(messages, event.messageId, event.runId, event.createdAt, {
      partId: event.progressId,
      kind: "progress",
      scope: event.scope,
      ...(event.toolCallId === undefined ? {} : { toolCallId: event.toolCallId }),
      ...(event.toolId === undefined ? {} : { toolId: event.toolId }),
      value: event.value,
    });
  }
  if (!("toolCallId" in event)) return messages;
  const previous = toolPart(messages, event.messageId, event.toolCallId);
  return upsertPart(messages, event.messageId, event.runId, event.createdAt, {
    partId: event.partId,
    kind: "tool",
    toolCallId: event.toolCallId,
    toolId: event.toolId,
    state: toolState[event.kind],
    ...(previous?.inputText === undefined ? {} : { inputText: previous.inputText }),
    ...(previous?.input === undefined ? {} : { input: previous.input }),
    ...(previous?.output === undefined ? {} : { output: previous.output }),
    ...(event.kind === "tool-input" ? { inputText: String(event.input ?? "") } : {}),
    ...(event.kind === "tool-input-ready" ? { input: event.input } : {}),
    ...(event.kind === "tool-succeeded" ? { output: event.output } : {}),
  });
}

const toolState = {
  "tool-started": "started",
  "tool-input": "input-streaming",
  "tool-input-ready": "input-ready",
  "tool-approval-required": "approval-required",
  "tool-executing": "running",
  "tool-succeeded": "succeeded",
  "tool-failed": "failed",
  "tool-denied": "denied",
} satisfies Record<Extract<AgentClientEvent, { toolCallId: string }>["kind"], ToolPartState>;

function upsertMessage(
  messages: readonly BrowserMessage[],
  message: BrowserMessage,
): readonly BrowserMessage[] {
  const index = messages.findIndex((item) => item.messageId === message.messageId);
  return index === -1
    ? [...messages, message]
    : messages.map((item, position) => (position === index ? message : item));
}

function upsertPart(
  messages: readonly BrowserMessage[],
  messageId: string,
  runId: string,
  createdAt: string,
  part: BrowserMessagePart,
): readonly BrowserMessage[] {
  const previous = messages.find((message) => message.messageId === messageId);
  const message: BrowserMessage = previous ?? {
    messageId,
    runId,
    role: "tool",
    parts: [],
    createdAt,
  };
  const match = (candidate: BrowserMessagePart) =>
    candidate.partId === part.partId ||
    (candidate.kind === "tool" && part.kind === "tool" && candidate.toolCallId === part.toolCallId);
  return upsertMessage(messages, {
    ...message,
    parts: message.parts.some(match)
      ? message.parts.map((candidate) => (match(candidate) ? part : candidate))
      : [...message.parts, part],
  });
}

function toolPart(
  messages: readonly BrowserMessage[],
  messageId: string,
  toolCallId: string,
): Extract<BrowserMessagePart, { kind: "tool" }> | undefined {
  return messages
    .find((message) => message.messageId === messageId)
    ?.parts.find(
      (part): part is Extract<BrowserMessagePart, { kind: "tool" }> =>
        part.kind === "tool" && part.toolCallId === toolCallId,
    );
}
