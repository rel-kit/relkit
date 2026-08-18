import type { JsonValue } from "@zsys/contracts";
import { generatedAgentFunctionId } from "./generated-function.js";
import {
  captureAgentContent,
  createAgentSpanCapture,
  completeAgentSpan,
  emitAgentEdge,
  emitAgentSpanComplete,
  emitAgentSpanStart,
  startAgentSpan,
  type AgentCapturePolicy,
  type AgentSpanOutcome,
} from "./observability.js";
import {
  createModelRequest,
  createModelTurn,
  type ModelMessage,
  type ModelProvider,
  type ModelRequest,
  type ModelTurn,
} from "./model-provider.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";
import {
  jsonValue,
  modelFailure,
  modelTools,
  runTool,
  signalFailure,
  validateValue,
  withSignal,
  findTool,
} from "./runtime-utils.js";
import { AgentRuntimeError } from "./runtime-errors.js";

type AgentOptions = AgentRuntimeOptions & AgentInvocationOptions;

export async function runAgentLoop(
  options: AgentOptions,
  signal: AbortSignal,
  input: unknown,
  maxInputBytes: number,
  maxOutputBytes: number,
  invocationId: string,
  traceId: string,
  agentSpanId: string,
  capture: AgentCapturePolicy,
): Promise<unknown> {
  const hooks = options.hooks;
  const tools = modelTools(options.agent.tools, options.tools);
  const messages: ModelMessage[] = [
    { role: "system", content: instructions(options) },
    { role: "user", content: jsonValue(input, maxInputBytes, "agent input") },
  ];
  let steps = 0;
  let toolCalls = 0;
  while (true) {
    if (signal.aborted) throw signalFailure(signal);
    if (steps >= options.agent.limits.maxSteps)
      throw new AgentRuntimeError("ZSYS_AGENT_STEP_LIMIT", "Agent step limit reached");
    steps += 1;
    const modelSpan = startAgentSpan({
      kind: "model",
      agentId: options.agent.id,
      invocationId,
      functionId: generatedAgentFunctionId(options.agent.id),
      name: `zsys.agent.${options.agent.id}.model`,
      traceId,
      parentSpanId: agentSpanId,
      attributes: { "zsys.model.profile": options.provider.profile, "zsys.agent.step": steps },
    });
    emitAgentSpanStart(hooks, modelSpan);
    let request: ModelRequest | undefined;
    let turn: ModelTurn | undefined;
    let modelOutcome: AgentSpanOutcome = "error";
    try {
      emitAgentEdge(hooks, {
        relationship: "uses-provider-profile",
        from: options.agent.id,
        to: options.provider.profile,
      });
      request = createModelRequest({
        profile: options.provider.profile,
        messages,
        tools,
        maxInputBytes,
        maxOutputBytes,
        signal,
      });
      turn = createModelTurn(
        await withSignal(options.provider.request(request), signal),
        maxOutputBytes,
      );
      modelOutcome =
        turn.type === "cancelled" ? "cancelled" : turn.type === "error" ? "error" : "success";
    } catch (cause) {
      modelOutcome = spanOutcome(cause, signal);
      throw modelFailure(cause, signal);
    } finally {
      emitAgentSpanComplete(
        hooks,
        completeAgentSpan(
          modelSpan,
          modelOutcome,
          createAgentSpanCapture(
            captureAgentContent(request?.messages, capture),
            captureAgentContent(turn, capture),
          ),
        ),
      );
    }
    if (turn?.type === "final") return validateValue(options.agent.output, turn.output, "output");
    if (turn?.type === "cancelled") throw signalFailure(signal);
    if (turn?.type === "error")
      throw new AgentRuntimeError("ZSYS_AGENT_MODEL_ERROR", "Model returned a safe error");
    if (toolCalls >= options.agent.limits.maxToolCalls)
      throw new AgentRuntimeError("ZSYS_AGENT_TOOL_LIMIT", "Agent tool-call limit reached");
    toolCalls += 1;
    const toolTurn = turn as Extract<ModelTurn, { readonly type: "tool-call" }>;
    const tool = findTool(options.tools, toolTurn.toolId);
    const toolSpan = startAgentSpan({
      kind: "tool",
      agentId: options.agent.id,
      invocationId,
      functionId: tool?.target.ref.id ?? toolTurn.toolId,
      name: `zsys.tool.${toolTurn.toolId}`,
      traceId,
      parentSpanId: modelSpan.spanId,
      attributes: {
        "zsys.tool.id": toolTurn.toolId,
        "zsys.tool.call.id": toolTurn.callId,
      },
    });
    emitAgentSpanStart(hooks, toolSpan);
    let toolResult: JsonValue | undefined;
    let toolOutcome: AgentSpanOutcome = "error";
    if (tool !== undefined && options.agent.tools.some((entry) => entry.ref.id === tool.id)) {
      emitAgentEdge(hooks, { relationship: "uses-tool", from: options.agent.id, to: tool.id });
      emitAgentEdge(hooks, {
        relationship: "targets-function",
        from: tool.id,
        to: tool.target.ref.id,
      });
    }
    try {
      toolResult = await runTool(
        options,
        toolTurn,
        signal,
        maxOutputBytes,
        invocationId,
        traceId,
        toolSpan.spanId,
      );
      toolOutcome = isSafeToolError(toolResult) ? "error" : "success";
    } catch (cause) {
      toolOutcome = spanOutcome(cause, signal);
      throw cause;
    } finally {
      emitAgentSpanComplete(
        hooks,
        completeAgentSpan(
          toolSpan,
          toolOutcome,
          createAgentSpanCapture(
            captureAgentContent(toolTurn.input, capture),
            captureAgentContent(toolResult, capture),
          ),
        ),
      );
    }
    messages.push({
      role: "assistant",
      content: {
        type: "tool-call",
        callId: toolTurn.callId,
        toolId: toolTurn.toolId,
        input: toolTurn.input,
      },
    });
    messages.push({ role: "tool", toolCallId: toolTurn.callId, content: toolResult! });
  }
}

function instructions(options: AgentOptions): string {
  return typeof options.agent.instructions === "string"
    ? options.agent.instructions
    : options.agent.instructions.template;
}

function spanOutcome(cause: unknown, signal: AbortSignal): AgentSpanOutcome {
  if (signal.aborted || (cause instanceof AgentRuntimeError && cause.code.includes("LIMIT"))) {
    return signal.aborted ? "cancelled" : "limit";
  }
  return "error";
}

function isSafeToolError(value: JsonValue | undefined): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) && "error" in value;
}
