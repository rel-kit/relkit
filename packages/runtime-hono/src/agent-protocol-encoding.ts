import { EventType } from "@ag-ui/core";
import { AGENT_STREAM_VERSION } from "@relkit/contracts";
import type { AgentExecutionEvent } from "@relkit/agents";
import type { AgentProtocolFrame } from "./agent-protocol-stream.js";

export function* agUiFrames(frame: AgentProtocolFrame): Iterable<unknown> {
  if (frame.kind === "state") {
    yield { type: EventType.STATE_SNAPSHOT, snapshot: frame.value };
  } else if (frame.kind === "text-start") {
    yield { type: EventType.TEXT_MESSAGE_START, messageId: frame.messageId, role: "assistant" };
  } else if (frame.kind === "text-delta") {
    yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId: frame.messageId, delta: frame.delta };
  } else if (frame.kind === "text-end") {
    yield { type: EventType.TEXT_MESSAGE_END, messageId: frame.messageId };
  } else if (frame.kind === "tool") {
    yield* agUiToolFrames(frame);
  } else if (frame.kind === "progress" || frame.kind === "approval") {
    yield {
      type: EventType.CUSTOM,
      name: `relkit.${frame.kind}`,
      value: frame.kind === "progress" ? frame : frame.value,
    };
  } else if (frame.kind === "event" && frame.event === "execution") {
    yield executionEvent(frame);
  } else if (frame.kind === "event") {
    yield { type: EventType.CUSTOM, name: `relkit.${frame.event}`, value: frame.value };
  } else if (frame.status === "succeeded") {
    yield {
      type: EventType.RUN_FINISHED,
      threadId: frame.threadId,
      runId: frame.runId,
      result: frame.text,
      outcome: { type: "success" },
    };
  } else {
    yield { type: EventType.RUN_ERROR, message: "Agent execution failed.", code: frame.status };
  }
}

type ToolFrame = Extract<AgentProtocolFrame, { kind: "tool" }>;

function* agUiToolFrames(frame: ToolFrame): Iterable<unknown> {
  if (["started", "input-streaming", "input-ready"].includes(frame.state)) {
    if (frame.inputStarted)
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId: frame.toolCallId,
        toolCallName: frame.toolId,
      };
    if (frame.inputDelta !== undefined)
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: frame.toolCallId,
        delta: frame.inputDelta,
      };
    if (frame.state === "input-ready")
      yield { type: EventType.TOOL_CALL_END, toolCallId: frame.toolCallId };
  } else if (frame.state === "succeeded") {
    yield {
      type: EventType.TOOL_CALL_RESULT,
      messageId: `${frame.toolCallId}:result`,
      toolCallId: frame.toolCallId,
      content: JSON.stringify(frame.value),
      role: "tool",
    };
  } else {
    yield { type: EventType.CUSTOM, name: "relkit.tool", value: frame };
  }
}

function executionEvent(frame: Extract<AgentProtocolFrame, { readonly kind: "event" }>): unknown {
  const value = frame.value;
  if (!isExecutionEvent(value)) {
    return { type: EventType.CUSTOM, name: "relkit.execution", value };
  }
  const metadata = {
    relkit: {
      protocol: "relkit.agent-event",
      version: AGENT_STREAM_VERSION,
      ...(frame.eventId === undefined ? {} : { eventId: frame.eventId }),
      ...(frame.recordId === undefined ? {} : { recordId: frame.recordId }),
      ...(frame.runId === undefined ? {} : { runId: frame.runId }),
      ...(frame.createdAt === undefined ? {} : { createdAt: frame.createdAt }),
      nativeSequence: value.nativeSequence,
      kind: value.kind,
      scope: value.scope,
      occurredAt: value.occurredAt,
      ...(value.agent === undefined ? {} : { agent: value.agent }),
      ...(value.parent === undefined ? {} : { parent: value.parent }),
      ...(value.node === undefined ? {} : { node: value.node }),
    },
  };
  if (value.kind === "values" && value.value !== undefined) {
    return { type: EventType.STATE_SNAPSHOT, snapshot: value.value, metadata };
  }
  return {
    type: EventType.CUSTOM,
    name: value.kind === "custom" ? customName(value.value) : "relkit.execution",
    value,
    metadata,
  };
}

function customName(value: unknown): string {
  return isRecord(value) && typeof value.name === "string" && value.name !== ""
    ? value.name
    : "relkit.custom";
}

function isExecutionEvent(value: unknown): value is AgentExecutionEvent {
  return (
    isRecord(value) &&
    typeof value.nativeSequence === "number" &&
    typeof value.kind === "string" &&
    Array.isArray(value.scope) &&
    value.scope.every((entry) => typeof entry === "string") &&
    typeof value.occurredAt === "string"
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
