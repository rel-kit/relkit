import type {
  AgentClientEvent,
  AgentProgressScope,
  AgentToolEvent,
  BrowserMessage,
  BrowserMessagePart,
  ToolPartState,
} from "@relkit/contracts";
import type {
  AgentBase,
  AgentContent,
  AgentMessage,
  AgentProgress,
} from "./agent-hook-types.types.js";
import { upsertMessage, upsertProgress, upsertTool } from "./agent-observation-index.js";
import {
  clientEventProjection,
  executionProjection,
  terminalProjection,
  updateSnapshotProjection,
} from "./agent-execution-observation.js";

/**
 * Creates empty indexed browser agent content without native resources.
 * @returns Empty browser content with independent identity indexes.
 */
export function emptyAgentContent(): AgentContent {
  return {
    timeline: [],
    timelineById: new Map(),
    messages: [],
    messagesById: new Map(),
    toolCalls: [],
    toolCallsById: new Map(),
    progress: [],
    progressById: new Map(),
  };
}

/**
 * Projects authoritative messages into indexed browser content.
 * @param messages - Authoritative canonical messages.
 * @returns Indexed content projected from the authoritative messages.
 */
export function agentContentFromMessages(messages: readonly BrowserMessage[]): AgentContent {
  return messages.reduce(upsertBrowserMessage, emptyAgentContent());
}

/**
 * Applies one canonical agent observation while preserving lifecycle and journal authority.
 * @typeParam Output - Declared successful output payload.
 * @param current - Current external-store state.
 * @param event - Canonical observation event.
 * @returns Agent state updated from one canonical observation.
 */
export function applyAgentEvent<Output>(
  current: AgentBase<Output>,
  event: AgentClientEvent,
): AgentBase<Output> {
  if (current.events.some((candidate) => candidate.eventId === event.eventId)) return current;
  let content: AgentContent = current;
  if (event.kind === "message-updated") content = upsertBrowserMessage(content, event.message);
  else if (event.kind === "progress") {
    const prior = content.progressById.get(event.progressId);
    content = upsertProgress(
      content,
      scopedProgress(
        {
          progressId: event.progressId,
          ...(event.messageId === undefined ? {} : { messageId: event.messageId }),
          runId: event.runId,
          value: event.value,
          createdAt: prior?.createdAt ?? event.createdAt,
          updatedAt: event.createdAt,
        },
        event,
      ),
    );
  } else if ("toolCallId" in event) content = upsertToolEvent(content, event);
  let next = { ...current, ...content };
  if (event.kind === "execution-event") {
    next = { ...next, ...executionProjection<Output>(next, event.value) };
  } else if (event.kind === "run-finished") {
    next = applyTerminal(next, event.value);
  } else if (event.kind === "run-interrupted") {
    next = { ...next, status: "worker-interrupted" };
  }
  const snapshot =
    next.snapshot === undefined ? undefined : updateSnapshotProjection(next.snapshot, next, event);
  return {
    ...next,
    events: [...current.events, clientEventProjection(event)].slice(
      -500,
    ) as AgentBase<Output>["events"],
    ...(snapshot === undefined ? {} : { snapshot }),
  };
}

/**
 * Projects an authoritative terminal outcome into the existing browser state.
 * @typeParam Output - Declared successful output payload.
 * @param current - Current external-store state.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Agent state with the authoritative terminal outcome.
 */
function applyTerminal<Output>(current: AgentBase<Output>, value: unknown): AgentBase<Output> {
  const { output: _output, waiting: _waiting, ...rest } = current;
  return { ...rest, ...terminalProjection<Output>(value) };
}

/**
 * Projects canonical message parts into stable browser message identity.
 * @param content - Current indexed browser content.
 * @param message - Authoritative canonical browser message and its projected parts.
 * @returns Content with canonical message parts projected into stable identity.
 */
function upsertBrowserMessage(content: AgentContent, message: BrowserMessage): AgentContent {
  let next = content;
  if (message.role !== "tool") {
    const value: AgentMessage = {
      messageId: message.messageId,
      ...(message.runId === undefined ? {} : { runId: message.runId }),
      role: message.role,
      parts: message.parts.filter(isTextPart),
      createdAt: message.createdAt,
    };
    next = upsertMessage(next, value);
  }
  for (const part of message.parts) {
    if (part.kind === "tool") next = upsertToolPart(next, message, part);
    else if (part.kind === "progress") {
      next = upsertProgress(
        next,
        scopedProgress(
          {
            progressId: part.partId,
            messageId: message.messageId,
            ...(message.runId === undefined ? {} : { runId: message.runId }),
            value: part.value,
            createdAt: message.createdAt,
            updatedAt: message.createdAt,
          },
          part,
        ),
      );
    }
  }
  return next;
}

/**
 * Projects an execution event into the existing indexed tool state.
 * @param content - Current indexed browser content.
 * @param event - Canonical observation event.
 * @returns Content with the execution event projected into tool state.
 */
function upsertToolEvent(content: AgentContent, event: AgentToolEvent): AgentContent {
  const prior = content.toolCallsById.get(event.toolCallId);
  return upsertTool(content, {
    toolCallId: event.toolCallId,
    messageId: event.messageId,
    partId: event.partId,
    runId: event.runId,
    toolId: event.toolId,
    state: toolEventStates[event.kind],
    ...(prior?.inputText === undefined ? {} : { inputText: prior.inputText }),
    ...(prior?.input === undefined ? {} : { input: prior.input }),
    ...(prior?.output === undefined ? {} : { output: prior.output }),
    ...(event.kind === "tool-input" ? { inputText: event.input } : {}),
    ...(event.kind === "tool-input-ready" ? { input: event.input } : {}),
    ...(event.kind === "tool-succeeded" ? { output: event.output } : {}),
    createdAt: prior?.createdAt ?? event.createdAt,
    updatedAt: event.createdAt,
  });
}

const toolEventStates = {
  "tool-started": "started",
  "tool-input": "input-streaming",
  "tool-input-ready": "input-ready",
  "tool-approval-required": "approval-required",
  "tool-executing": "running",
  "tool-succeeded": "succeeded",
  "tool-failed": "failed",
  "tool-denied": "denied",
} satisfies Record<AgentToolEvent["kind"], ToolPartState>;

/**
 * Adds or replaces a tool part without changing unrelated browser message state.
 * @param content - Current indexed browser content.
 * @param message - Authoritative canonical browser message owning the tool part.
 * @param part - Canonical message part.
 * @returns Content with the corresponding tool part updated.
 */
function upsertToolPart(
  content: AgentContent,
  message: BrowserMessage,
  part: Extract<BrowserMessagePart, { readonly kind: "tool" }>,
): AgentContent {
  return upsertTool(content, {
    toolCallId: part.toolCallId,
    messageId: message.messageId,
    partId: part.partId,
    ...(message.runId === undefined ? {} : { runId: message.runId }),
    toolId: part.toolId,
    state: part.state,
    ...(part.inputText === undefined ? {} : { inputText: part.inputText }),
    ...(part.input === undefined ? {} : { input: part.input }),
    ...(part.output === undefined ? {} : { output: part.output }),
    ...(part.state === "input-streaming" && part.inputText === undefined
      ? { inputText: String(part.value ?? "") }
      : {}),
    ...(part.state === "input-ready" && part.input === undefined ? { input: part.value } : {}),
    ...(part.state === "succeeded" && part.output === undefined ? { output: part.value } : {}),
    createdAt: message.createdAt,
    updatedAt: message.createdAt,
  });
}

/**
 * Projects existing progress scope into a stable browser progress identity.
 * @param value - Original input or payload; its identity is retained where required.
 * @param scope - Complete identity scope.
 * @returns Progress with stable scope and browser identity.
 */
function scopedProgress(
  value: Omit<AgentProgress, "scope" | "toolCallId" | "toolId">,
  scope: AgentProgressScope,
): AgentProgress {
  return scope.scope === "tool" ? { ...value, ...scope } : { ...value, scope: "run" };
}

/**
 * Checks whether a canonical message part carries text.
 * @param part - Canonical message part.
 * @returns Whether the canonical part contains text.
 */
function isTextPart(
  part: BrowserMessagePart,
): part is Extract<BrowserMessagePart, { readonly kind: "text" }> {
  return part.kind === "text";
}
