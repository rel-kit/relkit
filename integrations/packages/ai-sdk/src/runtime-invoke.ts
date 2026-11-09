/**
 * Runs one AI SDK agent invocation for the generated server: model from the agent's profile, tools
 * through the bridge, approvals through the run's approval handler.
 */
import {
  AgentAdapterError,
  createAgentToolBridge,
  type AgentThreadState,
  type ResolvedAgentModel,
} from "relkit/agent-adapters";
import type { ToolDescriptor } from "relkit/tools";
import { aiSdkAgentRuntime } from "./adapter-runtime.js";
import type { AiSdkInvocationOptions } from "./runtime-invoke.types.js";

/**
 * Invokes an AI SDK agent once and returns its validated output.
 * @param options - Agent, input, tool source, engine, model registry and approval handler.
 * @returns The agent output.
 * @throws AgentAdapterError when the run fails or waits for an approval nobody can give.
 * @example await invokeAgentFunction({ agent, input, tools, engine, modelRegistry });
 * @experimental
 */
export async function invokeAgentFunction(options: AiSdkInvocationOptions): Promise<unknown> {
  const { agent } = options;
  const threads = new Map<string, AgentThreadState>();
  const threadId = options.threadId ?? options.invocationId ?? crypto.randomUUID();
  const execution = aiSdkAgentRuntime.execution({
    agent: {
      ...agent,
      ...(typeof agent.model === "string" ? { model: agent.model } : {}),
    } as never,
    models: { resolve: (selector) => resolveModel(options, selector) },
    tools: createAgentToolBridge({
      agentId: agent.id,
      invocationId: options.invocationId ?? threadId,
      tools: declaredTools(options),
      engine: options.engine,
    }),
    state: {
      load: (id) => threads.get(id),
      save: (state) => void threads.set(state.threadId, state),
    },
  });
  let result = await execution.run({
    input: options.input,
    threadId,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  while (result.status === "interrupted") {
    const approval = options.approval;
    if (approval === undefined) {
      throw new AgentAdapterError("RELKIT_AGENT_RUN_PENDING", "The agent run needs an approval.");
    }
    const decisions: Record<string, "approved" | "denied"> = {};
    for (const pending of result.approvals) {
      const decision = await approval(pending);
      decisions[pending.toolCallId] =
        decision === true ||
        decision === "approved" ||
        (typeof decision === "object" && decision.state === "approved")
          ? "approved"
          : "denied";
    }
    result = await execution.resume({ threadId, decisions });
  }
  if (result.status !== "completed") {
    throw new AgentAdapterError("RELKIT_AGENT_RUN_FAILED", "The agent run was stopped.");
  }
  return result.output;
}

async function resolveModel(
  options: AiSdkInvocationOptions,
  selector: string | undefined,
): Promise<ResolvedAgentModel> {
  const native = options.agent.model;
  if (native !== undefined && typeof native !== "string") {
    return { id: "native:ai-sdk", profile: "native", model: native };
  }
  const profile = selector?.split(":", 1)[0] ?? "default";
  const registry = options.modelRegistry;
  if (registry === undefined) {
    if (selector === undefined) {
      throw new AgentAdapterError("RELKIT_AGENT_RUN_FAILED", "No model profile is bound.");
    }
    return { id: selector, profile, model: selector };
  }
  const selected = (await registry.resolveModel(selector)) as {
    readonly id?: unknown;
    readonly model?: unknown;
  };
  if (typeof selected?.id !== "string" || selected.model === undefined) {
    throw new AgentAdapterError("RELKIT_AGENT_RUN_FAILED", "The model profile returned no model.");
  }
  return { id: selected.id, profile, model: selected.model };
}

function declaredTools(options: AiSdkInvocationOptions): readonly ToolDescriptor<string>[] {
  const source = options.tools;
  const all: readonly ToolDescriptor<string>[] = Array.isArray(source)
    ? source
    : source instanceof Map
      ? [...source.values()]
      : Object.values(source as Readonly<Record<string, ToolDescriptor<string>>>);
  return options.agent.tools.map(({ ref }) => {
    const tool = all.find((candidate) => candidate.id === ref.id);
    if (tool === undefined) {
      throw new AgentAdapterError(
        "RELKIT_AGENT_TOOL_UNKNOWN",
        `Tool "${ref.id}" is not registered.`,
      );
    }
    return tool;
  });
}
