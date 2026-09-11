import type { ProtocolEvent } from "@langchain/langgraph";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { AgentContentSink } from "./runtime.js";
import type { ToolPartState } from "./state-types.js";
import { withSignal } from "./runtime-utils.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import {
  nativePublicEvent,
  publicToolValue,
  type NativeExecutionContext,
} from "./runtime-native-public.js";
import { NativeMessageAccumulator } from "./runtime-native-messages.js";

export async function collectNativeEvents(
  events: AsyncIterable<ProtocolEvent>,
  sink: AgentContentSink | undefined,
  toolIds: ReadonlyMap<string, string>,
  relkitNames: ReadonlySet<string>,
  signal: AbortSignal,
  limits: { readonly maxSteps: number; readonly maxToolCalls: number },
  stateSchemas: ReadonlyMap<string, StandardSchemaV1>,
  failure: () => unknown,
  observe: ((event: ProtocolEvent) => void) | undefined,
  abort: (reason: unknown) => void,
  eventSchemas: Readonly<Record<string, StandardSchemaV1>> = {},
): Promise<void> {
  let modelCalls = 0;
  let toolCalls = 0;
  const toolNames = new Map<string, string>();
  const contexts = new Map<string, NativeExecutionContext>();
  const messages = new NativeMessageAccumulator();
  for await (const event of events) {
    if (signal.aborted) throw signal.reason;
    if (isModelStart(event)) {
      modelCalls += 1;
      if (modelCalls > limits.maxSteps) {
        const error = new AgentRuntimeError("RELKIT_AGENT_STEP_LIMIT", "Agent step limit reached");
        abort(error);
        throw error;
      }
    }
    if (isToolStart(event)) {
      toolCalls += 1;
      if (toolCalls > limits.maxToolCalls) {
        const error = new AgentRuntimeError(
          "RELKIT_AGENT_TOOL_LIMIT",
          "Agent tool-call limit reached",
        );
        abort(error);
        throw error;
      }
    }
    trackExecutionContext(event, contexts);
    await emitToolEvent(event, sink, toolIds, relkitNames, toolNames, signal);
    observe?.(event);
    const publicEvent = await nativePublicEvent(
      event,
      stateSchemas,
      executionContext(event, contexts),
      eventSchemas,
    );
    if (sink?.emitEvent !== undefined) {
      await withSignal(sink.emitEvent(publicEvent, signal), signal);
    }
    const message = messages.update(publicEvent);
    if (message !== undefined && sink?.emitMessage !== undefined) {
      await withSignal(sink.emitMessage(message, signal), signal);
    }
    const toolFailure = failure();
    if (toolFailure !== undefined) {
      abort(toolFailure);
      throw toolFailure;
    }
  }
}

function trackExecutionContext(
  event: ProtocolEvent,
  contexts: Map<string, NativeExecutionContext>,
): void {
  const data = event.params.data;
  if (!isRecord(data)) return;
  const key = scopeKey(event.params.namespace);
  if (event.method === "tasks" && isRecord(data.metadata)) {
    const agent = data.metadata.lc_agent_name;
    if (typeof agent === "string" && agent !== "") {
      contexts.set(key, { ...contexts.get(key), agent });
    }
    return;
  }
  if (
    event.method !== "tools" ||
    data.event !== "tool-started" ||
    data.tool_name !== "task" ||
    typeof data.tool_call_id !== "string"
  ) {
    return;
  }
  const input = publicToolValue(data.input);
  if (!isRecord(input) || typeof input.subagent_type !== "string") return;
  contexts.set(key, {
    agent: input.subagent_type,
    parent: { kind: "tool", toolCallId: data.tool_call_id, toolId: "task" },
  });
}

function executionContext(
  event: ProtocolEvent,
  contexts: ReadonlyMap<string, NativeExecutionContext>,
): NativeExecutionContext {
  for (let length = event.params.namespace.length; length >= 0; length -= 1) {
    const found = contexts.get(scopeKey(event.params.namespace.slice(0, length)));
    if (found !== undefined) return found;
  }
  return {};
}

function scopeKey(namespace: readonly string[]): string {
  return namespace.join("\u0000");
}

function isModelStart(event: ProtocolEvent): boolean {
  return (
    event.method === "tasks" &&
    isRecord(event.params.data) &&
    event.params.data.name === "model_request" &&
    !("result" in event.params.data)
  );
}

function isToolStart(event: ProtocolEvent): boolean {
  return (
    event.method === "tools" &&
    isRecord(event.params.data) &&
    event.params.data.event === "tool-started"
  );
}

async function emitToolEvent(
  event: ProtocolEvent,
  sink: AgentContentSink | undefined,
  toolIds: ReadonlyMap<string, string>,
  relkitNames: ReadonlySet<string>,
  toolNames: Map<string, string>,
  signal: AbortSignal,
): Promise<void> {
  if (event.method !== "tools" || sink?.emitTool === undefined || !isRecord(event.params.data)) {
    return;
  }
  const data = event.params.data;
  const callId = data.tool_call_id;
  if (typeof callId !== "string") return;
  const suppliedName = typeof data.tool_name === "string" ? data.tool_name : undefined;
  if (suppliedName !== undefined) toolNames.set(callId, suppliedName);
  const nativeName = suppliedName ?? toolNames.get(callId);
  if (relkitNames.has(nativeName ?? "")) return;
  const toolId = nativeName === undefined ? "unknown" : (toolIds.get(nativeName) ?? nativeName);
  const emit = (state: ToolPartState, value?: unknown) =>
    withSignal(
      sink.emitTool!(
        {
          toolCallId: callId,
          toolId,
          state,
          ...(value === undefined ? {} : { value }),
        },
        signal,
      ),
      signal,
    );
  if (data.event === "tool-started") {
    await emit("started");
    await emit("input-ready", publicToolValue(data.input));
    await emit("running");
    return;
  }
  const output = publicToolValue(data.output);
  const state = toolState(data.event, output);
  if (state !== undefined) await emit(state, output);
}

function toolState(event: unknown, output: unknown): ToolPartState | undefined {
  if (event === "tool-error" || isSafeToolError(output)) return "failed";
  if (event === "tool-finished") return "succeeded";
  return undefined;
}

function isSafeToolError(value: unknown): boolean {
  return isRecord(value) && isRecord(value.error) && typeof value.error.code === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
