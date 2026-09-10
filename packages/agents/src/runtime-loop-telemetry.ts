import type { ProtocolEvent } from "@langchain/langgraph";
import { frameworkTrace } from "@relkit/invocation";
import { relkitToolRefs } from "./define-agent-native.js";
import { emitAgentEdge } from "./observability.js";
import type { AgentRuntimeOptions } from "./runtime.js";
import { findModelTool } from "./runtime-tools.js";

export function createLoopTelemetry(runtime: AgentRuntimeOptions, modelId: string) {
  let step = 0;
  return (event: ProtocolEvent): void => {
    if (event.method === "tasks" && isRecord(event.params.data)) {
      const data = event.params.data;
      if (data.name === "model_request" && !("result" in data)) {
        step += 1;
        frameworkTrace.event("agent.model.step.started", { "relkit.agent.step": step });
        emitAgentEdge(runtime.hooks, {
          relationship: "uses-provider-profile",
          from: runtime.agent.id,
          to: modelId,
        });
      } else if (data.name === "model_request" && "result" in data) {
        frameworkTrace.event("agent.model.step.completed", { "relkit.agent.step": step });
      }
      return;
    }
    if (event.method !== "tools" || !isRecord(event.params.data)) return;
    const data = event.params.data;
    const name = typeof data.tool_name === "string" ? data.tool_name : "unknown";
    const callId = typeof data.tool_call_id === "string" ? data.tool_call_id : "unknown";
    const refs = relkitToolRefs(runtime.agent.tools);
    const descriptor = findModelTool(runtime.tools, refs, name);
    if (data.event === "tool-started") {
      frameworkTrace.event("agent.tool.started", {
        "relkit.tool.id": descriptor?.id ?? name,
        "relkit.tool.call.id": callId,
      });
      if (descriptor === undefined) return;
      emitAgentEdge(runtime.hooks, {
        relationship: "uses-tool",
        from: runtime.agent.id,
        to: descriptor.id,
      });
      emitAgentEdge(runtime.hooks, {
        relationship: "targets-function",
        from: descriptor.id,
        to: descriptor.target.ref.id,
      });
    } else if (data.event === "tool-finished" || data.event === "tool-error") {
      frameworkTrace.event("agent.tool.completed", {
        "relkit.tool.id": descriptor?.id ?? name,
        "relkit.tool.call.id": callId,
        "relkit.tool.failed": data.event === "tool-error",
      });
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
