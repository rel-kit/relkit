import type { AgentToolEvent, ToolPartState } from "@relkit/agents";
import type { ToolFrame, ToolPart } from "./agent-protocol-tool.types.js";

/** Map a native tool event to its public tool phase and input delta.
 * @param event - Native event to translate.
 * @param inputs - Accumulated tool input text indexed by call ID.
 * @returns A tool frame while updating the accumulated input text.
 */
export function toolEventFrame(event: AgentToolEvent, inputs: Map<string, string>): ToolFrame {
  const states = {
    "tool-started": "started",
    "tool-input": "input-streaming",
    "tool-input-ready": "input-ready",
    "tool-approval-required": "approval-required",
    "tool-executing": "running",
    "tool-succeeded": "succeeded",
    "tool-failed": "failed",
    "tool-denied": "denied",
  } satisfies Record<AgentToolEvent["kind"], ToolPartState>;
  return toolFrame(
    {
      partId: event.eventId,
      kind: "tool",
      toolCallId: event.toolCallId,
      toolId: event.toolId,
      state: states[event.kind],
      ...("input" in event
        ? { value: event.input }
        : "output" in event
          ? { value: event.output }
          : {}),
    },
    inputs,
  );
}

/** Project a tool part and compute only newly received input text.
 * @param part - Tool message part to project.
 * @param inputs - Accumulated tool input text indexed by call ID.
 * @returns A frame retaining tool identity, phase, value and optional input delta.
 * @example
 * const inputs = new Map<string, string>([["call-1", "hel"]]);
 * const frame = toolFrame({ kind: "tool", partId: "part-1", toolCallId: "call-1",
 *   toolId: "search", state: "input-streaming", inputText: "hello" }, inputs);
 * // frame.inputDelta === "lo"
 */
export function toolFrame(part: ToolPart, inputs: Map<string, string>): ToolFrame {
  const prior = inputs.get(part.toolCallId);
  if (part.state === "started") inputs.set(part.toolCallId, "");
  const input =
    part.state === "input-streaming"
      ? (part.inputText ?? (typeof part.value === "string" ? part.value : undefined))
      : undefined;
  if (input !== undefined) inputs.set(part.toolCallId, input);
  const encoded =
    part.state === "input-ready" ? JSON.stringify(part.input ?? part.value) : undefined;
  const delta =
    input !== undefined
      ? input.startsWith(prior ?? "")
        ? input.slice(prior?.length ?? 0)
        : input
      : prior === undefined || prior === ""
        ? encoded
        : encoded?.startsWith(prior)
          ? encoded.slice(prior.length)
          : undefined;
  return {
    kind: "tool",
    toolCallId: part.toolCallId,
    toolId: part.toolId,
    state: part.state,
    ...(part.state === "input-ready"
      ? { value: part.input ?? part.value }
      : part.state === "succeeded"
        ? { value: part.output ?? part.value }
        : part.value === undefined
          ? {}
          : { value: part.value }),
    ...((part.state === "started" ||
      part.state === "input-streaming" ||
      part.state === "input-ready") &&
    prior === undefined
      ? { inputStarted: true }
      : {}),
    ...(delta === undefined || delta === "" ? {} : { inputDelta: delta }),
  };
}
