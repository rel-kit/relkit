import { createMiddleware, type AnyAgentMiddleware } from "langchain";
import type { AgentLimits } from "./define-agent.js";
import { AgentRuntimeError } from "./runtime-errors.js";

/** Limits actual native calls before providers or tools can perform duplicate work. */
export function createNativeLimitMiddleware(limits: AgentLimits): AnyAgentMiddleware {
  let modelCalls = 0;
  let toolCalls = 0;
  return createMiddleware({
    name: "RelkitInvocationLimits",
    wrapModelCall: (request, handler) => {
      if (modelCalls >= limits.maxSteps) {
        throw new AgentRuntimeError("RELKIT_AGENT_STEP_LIMIT", "Agent step limit exceeded");
      }
      modelCalls += 1;
      return handler(request);
    },
    wrapToolCall: (request, handler) => {
      if (toolCalls >= limits.maxToolCalls) {
        throw new AgentRuntimeError("RELKIT_AGENT_TOOL_LIMIT", "Agent tool-call limit exceeded");
      }
      toolCalls += 1;
      return handler(request);
    },
  });
}
