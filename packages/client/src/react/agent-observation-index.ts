import type {
  AgentContent,
  AgentMessage,
  AgentProgress,
  AgentTimelineItem,
  AgentToolCall,
} from "./agent-hook-types.js";

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

function withTimeline(content: AgentContent, key: string, value: AgentTimelineItem): AgentContent {
  const [timeline, timelineById] = indexedUpsert(
    content.timeline,
    content.timelineById,
    key,
    value,
  );
  return { ...content, timeline, timelineById };
}

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
