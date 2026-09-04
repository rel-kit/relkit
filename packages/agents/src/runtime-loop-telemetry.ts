import type {
  GenerateTextStepEndEvent,
  GenerateTextStepStartEvent,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
} from "ai";
import { frameworkTrace } from "@relkit/invocation";
import { emitAgentEdge, type AgentCapturePolicy } from "./observability.js";
import { findTool } from "./runtime-tools.js";
import type { AgentRuntimeOptions } from "./runtime.js";

export function createLoopTelemetry(options: {
  readonly runtime: AgentRuntimeOptions;
  readonly input: unknown;
  readonly instructions: string;
  readonly modelId: string;
  readonly invocationId: string;
  readonly traceId: string;
  readonly capture: AgentCapturePolicy;
  readonly signal: AbortSignal;
}) {
  const runtime = options.runtime;
  const hooks = runtime.hooks;
  return {
    close: () => undefined,
    onStepStart: (event: GenerateTextStepStartEvent) => {
      frameworkTrace.event("agent.model.step.started", {
        "relkit.agent.step": event.stepNumber + 1,
      });
      emitAgentEdge(hooks, {
        relationship: "uses-provider-profile",
        from: runtime.agent.id,
        to: options.modelId,
      });
    },
    onToolExecutionStart: (event: ToolExecutionStartEvent) => {
      const descriptor = findTool(runtime.tools, event.toolCall.toolName);
      frameworkTrace.event("agent.tool.started", {
        "relkit.tool.id": event.toolCall.toolName,
        "relkit.tool.call.id": event.toolCall.toolCallId,
      });
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
      frameworkTrace.event("agent.tool.completed", {
        "relkit.tool.id": event.toolCall.toolName,
        "relkit.tool.call.id": event.toolCall.toolCallId,
        "relkit.tool.failed": event.toolOutput.type === "tool-error",
      });
    },
    onStepEnd: (event: GenerateTextStepEndEvent) =>
      frameworkTrace.event("agent.model.step.completed", {
        "relkit.agent.step": event.stepNumber + 1,
        "relkit.agent.finish_reason": event.finishReason,
      }),
  };
}
