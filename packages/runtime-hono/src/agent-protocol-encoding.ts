import { EventType } from "@ag-ui/core";
import type { AgentExecutionEvent } from "@relkit/agents";
import { AGENT_STREAM_VERSION } from "@relkit/contracts";
import type { ToolFrame } from "./agent-protocol-encoding.types.js";
import type { AgentProtocolFrame } from "./agent-protocol-stream.js";

/** Translate one native agent frame into AG-UI protocol events.
 * @param frame - Native frame to validate or encode.
 * @returns Ordered AG-UI events for state, text, tools and terminal outcomes.
 */
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

/** Translate tool input and result phases into AG-UI tool events.
 * @param frame - Native frame to validate or encode.
 * @returns Tool start, argument, end, result or custom events.
 */
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

/** Encode execution events with native journal metadata for replay correlation.
 * @param frame - Native frame to validate or encode.
 * @returns An AG-UI state snapshot or custom event with RELKIT metadata.
 */
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

/** Read a nonempty custom event name or use the RELKIT fallback.
 * @param value - Value to validate or project.
 * @returns The custom name, defaulting to relkit.custom.
 */
function customName(value: unknown): string {
  return isRecord(value) && typeof value.name === "string" && value.name !== ""
    ? value.name
    : "relkit.custom";
}

/** Validate the metadata needed to encode native execution events.
 * @param value - Value to validate or project.
 * @returns Whether sequence, scope, kind and timestamp have supported shapes.
 */
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

/** Check whether a value is a non-null object suitable for field inspection.
 * @param value - Value to validate or project.
 * @returns Whether object fields can be inspected.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
