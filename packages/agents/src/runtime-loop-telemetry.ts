import type {
  GenerateTextStepEndEvent,
  GenerateTextStepStartEvent,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
} from "ai";
import type { JsonValue } from "@zsys/contracts";
import { AgentRuntimeError } from "./runtime-errors.js";
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
  type AgentSpanRecord,
} from "./observability.js";
import { generatedAgentFunctionId } from "./generated-function.js";
import { findTool } from "./runtime-tools.js";
import type { AgentRuntimeOptions } from "./runtime.js";

export function createLoopTelemetry(options: {
  readonly runtime: AgentRuntimeOptions;
  readonly input: unknown;
  readonly instructions: string;
  readonly modelId: string;
  readonly invocationId: string;
  readonly traceId: string;
  readonly agentSpanId: string;
  readonly capture: AgentCapturePolicy;
  readonly signal: AbortSignal;
}) {
  const runtime = options.runtime;
  const hooks = runtime.hooks;
  let modelSpan: AgentSpanRecord | undefined;
  let modelInput: unknown;
  let modelSpanId: string | undefined;
  const toolSpans = new Map<string, AgentSpanRecord>();

  return {
    modelSpanId: () => modelSpanId,
    toolSpanId: (callId: string) => toolSpans.get(callId)?.spanId ?? modelSpanId,
    close: (cause: unknown, signal: AbortSignal) => closeModel(spanOutcome(cause, signal)),
    onStepStart: (event: GenerateTextStepStartEvent) => {
      modelSpan = startAgentSpan({
        kind: "model",
        agentId: runtime.agent.id,
        invocationId: options.invocationId,
        functionId: generatedAgentFunctionId(runtime.agent.id),
        name: `zsys.agent.${runtime.agent.id}.model`,
        traceId: options.traceId,
        parentSpanId: options.agentSpanId,
        attributes: { "zsys.model.id": options.modelId, "zsys.agent.step": event.stepNumber + 1 },
      });
      modelSpanId = modelSpan.spanId;
      modelInput =
        event.stepNumber === 0
          ? [
              { role: "system", content: options.instructions },
              { role: "user", content: options.input },
            ]
          : event.messages;
      emitAgentSpanStart(hooks, modelSpan);
      emitAgentEdge(hooks, {
        relationship: "uses-provider-profile",
        from: runtime.agent.id,
        to: options.modelId,
      });
    },
    onToolExecutionStart: (event: ToolExecutionStartEvent) => {
      closeModel("success", event.toolCall);
      const descriptor = findTool(runtime.tools, event.toolCall.toolName);
      const span = startAgentSpan({
        kind: "tool",
        agentId: runtime.agent.id,
        invocationId: options.invocationId,
        functionId: descriptor?.target.ref.id ?? event.toolCall.toolName,
        name: `zsys.tool.${event.toolCall.toolName}`,
        traceId: options.traceId,
        ...(modelSpanId === undefined ? {} : { parentSpanId: modelSpanId }),
        attributes: {
          "zsys.tool.id": event.toolCall.toolName,
          "zsys.tool.call.id": event.toolCall.toolCallId,
        },
      });
      toolSpans.set(event.toolCall.toolCallId, span);
      emitAgentSpanStart(hooks, span);
      if (
        descriptor !== undefined &&
        runtime.agent.tools.some((entry) => entry.ref.id === descriptor.id)
      ) {
        emitAgentEdge(hooks, {
          relationship: "uses-tool",
          from: runtime.agent.id,
          to: descriptor.id,
        });
        emitAgentEdge(hooks, {
          relationship: "targets-function",
          from: descriptor.id,
          to: descriptor.target.ref.id,
        });
      }
    },
    onToolExecutionEnd: (event: ToolExecutionEndEvent) => {
      const span = toolSpans.get(event.toolCall.toolCallId);
      if (span === undefined) return;
      toolSpans.delete(event.toolCall.toolCallId);
      const failed = event.toolOutput.type === "tool-error";
      emitAgentSpanComplete(
        hooks,
        completeAgentSpan(
          span,
          failed ? spanOutcome(event.toolOutput.error, options.signal) : "success",
          createAgentSpanCapture(
            captureAgentContent(event.toolCall.input, options.capture),
            captureAgentContent(
              failed ? safeError(event.toolOutput.error) : event.toolOutput.output,
              options.capture,
            ),
          ),
        ),
      );
    },
    onStepEnd: (event: GenerateTextStepEndEvent) =>
      closeModel(stepOutcome(event.finishReason), event.content),
  };

  function closeModel(outcome: AgentSpanOutcome, output?: unknown): void {
    if (modelSpan === undefined) return;
    emitAgentSpanComplete(
      hooks,
      completeAgentSpan(
        modelSpan,
        outcome,
        createAgentSpanCapture(
          captureAgentContent(modelInput, options.capture),
          captureAgentContent(output, options.capture),
        ),
      ),
    );
    modelSpan = undefined;
    modelInput = undefined;
  }
}

function stepOutcome(reason: string): AgentSpanOutcome {
  return reason === "length" ? "limit" : reason === "error" ? "error" : "success";
}

function spanOutcome(cause: unknown, signal: AbortSignal): AgentSpanOutcome {
  if (signal.aborted) return "cancelled";
  return cause instanceof AgentRuntimeError && cause.code.includes("LIMIT") ? "limit" : "error";
}

function safeError(value: unknown): JsonValue {
  const code =
    value !== null && typeof value === "object" && "code" in value && typeof value.code === "string"
      ? value.code.startsWith("ZSYS_")
        ? value.code
        : "ZSYS_TOOL_FAILED"
      : "ZSYS_TOOL_FAILED";
  return { error: { code, message: "Tool call failed" } };
}
