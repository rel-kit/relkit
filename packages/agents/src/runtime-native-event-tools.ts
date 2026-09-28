import type { ProtocolEvent } from "@langchain/langgraph";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { publicToolValueEffect } from "./runtime-native-public-tools.js";
import type { AgentContentSink } from "./runtime.types.js";
import { signalFailure, withSignal } from "./signal.js";
import type { ToolPartState } from "./state.types.js";

/** Emits public lifecycle updates for a native tool event.
 * @param event - Native event.
 * @param sink - Optional client sink.
 * @param toolIds - Public tool name mapping.
 * @param relkitNames - RELKIT owned tool names.
 * @param toolNames - Mutable call name map.
 * @param signal - Invocation cancellation signal.
 * @returns An Effect with void or AgentInvocationFailure.
 * @example await Effect.runPromise(emitToolEventEffect(event, sink, ids, names, calls, signal));
 */
export const emitToolEventEffect = Effect.fn("Agents.runtime.emitNativeToolEvent")(
  function* (
    event: ProtocolEvent,
    sink: AgentContentSink | undefined,
    toolIds: ReadonlyMap<string, string>,
    relkitNames: ReadonlySet<string>,
    toolNames: Map<string, string>,
    signal: AbortSignal,
  ) {
    if (event.method !== "tools" || sink?.emitTool === undefined || !isRecord(event.params.data))
      return;
    const data = event.params.data;
    const callId = data.tool_call_id;
    if (typeof callId !== "string") return;
    const suppliedName = typeof data.tool_name === "string" ? data.tool_name : undefined;
    if (suppliedName !== undefined) toolNames.set(callId, suppliedName);
    const nativeName = suppliedName ?? toolNames.get(callId);
    if (relkitNames.has(nativeName ?? "")) return;
    const toolId = nativeName === undefined ? "unknown" : (toolIds.get(nativeName) ?? nativeName);
    const emit = (state: ToolPartState, value?: unknown) => {
      if (signal.aborted) return Effect.fail(agentInvocationFailure(signalFailure(signal)));
      return Effect.tryPromise({
        try: (effectSignal) => {
          const combined = AbortSignal.any([signal, effectSignal]);
          return withSignal(
            sink.emitTool!(
              {
                toolCallId: callId,
                toolId,
                state,
                ...(value === undefined ? {} : { value }),
              },
              combined,
            ),
            combined,
          );
        },
        catch: agentInvocationFailure,
      });
    };
    if (data.event === "tool-started") {
      yield* emit("started");
      yield* emit("input-ready", yield* publicToolValueEffect(data.input));
      yield* emit("running");
      return;
    }
    const output = yield* publicToolValueEffect(data.output);
    const state = toolState(data.event, output);
    if (state !== undefined) yield* emit(state, output);
  },
  (effect) => observeAgent("runtime.emit-native-tool-event", effect),
);

/** Emits a native tool event for existing Promise callers.
 * @param event - Native event.
 * @param sink - Optional client sink.
 * @param toolIds - Public tool name mapping.
 * @param relkitNames - RELKIT owned tool names.
 * @param toolNames - Mutable call name map.
 * @param signal - Invocation cancellation signal.
 * @returns A Promise that resolves after all lifecycle emissions.
 * @throws The original sink or cancellation error.
 * @example await emitToolEvent(event, sink, ids, names, calls, signal);
 */
export function emitToolEvent(
  event: ProtocolEvent,
  sink: AgentContentSink | undefined,
  toolIds: ReadonlyMap<string, string>,
  relkitNames: ReadonlySet<string>,
  toolNames: Map<string, string>,
  signal: AbortSignal,
): Promise<void> {
  return Effect.runPromise(
    emitToolEventEffect(event, sink, toolIds, relkitNames, toolNames, signal).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    ),
    { signal },
  );
}

function toolState(event: unknown, output: unknown): ToolPartState | undefined {
  if (event === "tool-error" || isSafeToolError(output)) return "failed";
  if (event === "tool-finished") return "succeeded";
  return undefined;
}

function isSafeToolError(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    value.error.message === "Tool call failed"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
