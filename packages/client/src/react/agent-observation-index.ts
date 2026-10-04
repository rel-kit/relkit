import type { AgentToolCall } from "./agent-hook-types.js";
import type {
  AgentContent,
  AgentMessage,
  AgentProgress,
  AgentTimelineItem,
} from "./agent-hook-types.types.js";

/**
 * Replaces or appends one message while preserving its timeline position.
 * @param content - Current indexed browser content.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Content with the message updated at its retained timeline position.
 */
export function upsertMessage(content: AgentContent, value: AgentMessage): AgentContent {
  const [messages, messagesById] = indexedUpsert(
    content.messages,
    content.messagesById,
    value.messageId,
    value,
  );
  return withTimeline({ ...content, messages, messagesById }, `message:${value.messageId}`, {
    key: `message:${value.messageId}`,
    kind: "message",
    message: value,
  });
}

/**
 * Replaces or appends one tool call while preserving its timeline position.
 * @param content - Current indexed browser content.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Content with the tool call updated at its retained timeline position.
 */
export function upsertTool(content: AgentContent, value: AgentToolCall): AgentContent {
  const [toolCalls, toolCallsById] = indexedUpsert(
    content.toolCalls,
    content.toolCallsById,
    value.toolCallId,
    value,
  );
  return withTimeline({ ...content, toolCalls, toolCallsById }, `tool:${value.toolCallId}`, {
    key: `tool:${value.toolCallId}`,
    kind: "tool",
    toolCall: value,
  });
}

/**
 * Replaces or appends one scoped progress item while preserving its timeline position.
 * @param content - Current indexed browser content.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Content with scoped progress updated in place.
 */
export function upsertProgress(content: AgentContent, value: AgentProgress): AgentContent {
  const [progress, progressById] = indexedUpsert(
    content.progress,
    content.progressById,
    value.progressId,
    value,
  );
  return withTimeline({ ...content, progress, progressById }, `progress:${value.progressId}`, {
    key: `progress:${value.progressId}`,
    kind: "progress",
    progress: value,
  });
}

/**
 * Updates one timeline entry without reordering an existing entry.
 * @param content - Current indexed browser content.
 * @param key - Existing canonical identity key.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Content with the timeline entry inserted or replaced.
 */
function withTimeline(content: AgentContent, key: string, value: AgentTimelineItem): AgentContent {
  const [timeline, timelineById] = indexedUpsert(
    content.timeline,
    content.timelineById,
    key,
    value,
  );
  return { ...content, timeline, timelineById };
}

/**
 * Updates both insertion-ordered values and their identity index.
 * @typeParam T - Input and successful result type.
 * @param values - Existing insertion-ordered values.
 * @param index - Existing identity index.
 * @param id - Existing observer or item identity.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Insertion-ordered values and their matching identity index.
 */
function indexedUpsert<T>(
  values: readonly T[],
  index: ReadonlyMap<string, T>,
  id: string,
  value: T,
): readonly [readonly T[], ReadonlyMap<string, T>] {
  const prior = index.get(id);
  const next = new Map(index).set(id, value);
  return [
    prior === undefined
      ? [...values, value]
      : values.map((item) => (item === prior ? value : item)),
    next,
  ];
}
