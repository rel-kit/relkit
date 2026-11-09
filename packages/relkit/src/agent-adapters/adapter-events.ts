/**
 * Maps neutral adapter frames to AG-UI events. RelKit owns this mapping so every adapter streams
 * the same events; the type names match `@ag-ui/core`'s `EventType` values.
 */
import type { AgentAdapterFrame } from "./adapter.types.js";

/**
 * Translates one adapter frame into ordered AG-UI events.
 * @param frame - Neutral frame emitted by an adapter run.
 * @returns AG-UI event objects.
 * @example [...agUiEvents({ kind: "text", messageId: "m", delta: "hi" })];
 * @experimental
 */
export function* agUiEvents(frame: AgentAdapterFrame): Iterable<Readonly<Record<string, unknown>>> {
  switch (frame.kind) {
    case "run-started":
      yield { type: "RUN_STARTED", threadId: frame.threadId, runId: frame.runId };
      return;
    case "text":
      yield { type: "TEXT_MESSAGE_START", messageId: frame.messageId, role: "assistant" };
      yield { type: "TEXT_MESSAGE_CONTENT", messageId: frame.messageId, delta: frame.delta };
      yield { type: "TEXT_MESSAGE_END", messageId: frame.messageId };
      return;
    case "tool-call":
      yield {
        type: "TOOL_CALL_START",
        toolCallId: frame.call.toolCallId,
        toolCallName: frame.toolId,
      };
      yield {
        type: "TOOL_CALL_ARGS",
        toolCallId: frame.call.toolCallId,
        delta: JSON.stringify(frame.call.input ?? {}),
      };
      yield { type: "TOOL_CALL_END", toolCallId: frame.call.toolCallId };
      return;
    case "tool-result":
      if (frame.outcome.status === "succeeded") {
        yield {
          type: "TOOL_CALL_RESULT",
          messageId: `${frame.outcome.toolCallId}:result`,
          toolCallId: frame.outcome.toolCallId,
          content: JSON.stringify(frame.outcome.output ?? null),
          role: "tool",
        };
      } else {
        yield { type: "CUSTOM", name: "relkit.tool", value: frame.outcome };
      }
      return;
    case "approval":
      yield { type: "CUSTOM", name: "relkit.approval", value: frame.approvals };
      return;
    case "run-finished":
      yield {
        type: "RUN_FINISHED",
        threadId: frame.threadId,
        runId: frame.runId,
        result: frame.result.status === "completed" ? frame.result.output : undefined,
        outcome:
          frame.result.status === "interrupted"
            ? { type: "interrupt", approvals: frame.result.approvals }
            : { type: frame.result.status === "stopped" ? "stopped" : "success" },
      };
      return;
    case "run-error":
      yield { type: "RUN_ERROR", message: frame.message, code: frame.code };
  }
}
