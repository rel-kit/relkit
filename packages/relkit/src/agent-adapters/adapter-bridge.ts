/**
 * Bridges model tool calls to the common engine. Approvals, the engine's access check and tool
 * failures are handled here, so every adapter calls tools the same way.
 */
import { getJsonSchema } from "../schema/index.js";
import { invokeTool, type ToolDescriptor } from "../tools/index.js";
import { createApproval, requiresApproval } from "../agents/approval.js";
import type { PendingApproval } from "../agents/approval.types.js";
import type { AgentToolBridgeOptions } from "./adapter-bridge.types.js";
import type {
  AgentToolBridge,
  AgentToolCall,
  AgentToolDefinition,
  AgentToolOutcome,
} from "./adapter.types.js";

type BridgeCallOptions = NonNullable<Parameters<AgentToolBridge["call"]>[1]>;

/**
 * Derives the model-facing name of a tool; dots and other separators become underscores.
 * @param toolId - Canonical tool ID.
 * @returns A name every first-party SDK accepts.
 * @example modelToolName("orders.lookup"); // "orders_lookup"
 * @experimental
 */
export function modelToolName(toolId: string): string {
  return toolId.replace(/[^A-Za-z0-9_-]/gu, "_");
}

/**
 * Creates the tool bridge for one agent invocation.
 * @param options - Agent identity, declared tools, engine and the engine access check.
 * @returns Tool definitions for the model and the call operation.
 * @example const bridge = createAgentToolBridge({ agentId, invocationId, tools, engine });
 * @experimental
 */
export function createAgentToolBridge(options: AgentToolBridgeOptions): AgentToolBridge {
  const byName = new Map(options.tools.map((tool) => [modelToolName(tool.id), tool]));
  const definitions = Object.freeze(options.tools.map(definition));
  return Object.freeze({
    definitions,
    call: async (call: AgentToolCall, callOptions: BridgeCallOptions = {}) => {
      const tool = byName.get(call.name);
      if (tool === undefined) {
        return failed(call, "RELKIT_AGENT_TOOL_UNKNOWN", `Unknown tool "${call.name}".`);
      }
      const span = options.trace?.start("agent.tool", { toolId: tool.id });
      const outcome = await callTool(options, tool, call, callOptions);
      span?.end(outcome.status === "succeeded" ? "ok" : "error");
      return outcome;
    },
  });
}

async function callTool(
  options: AgentToolBridgeOptions,
  tool: ToolDescriptor<string>,
  call: AgentToolCall,
  callOptions: BridgeCallOptions,
): Promise<AgentToolOutcome> {
  if (requiresApproval(tool.approval, tool.sideEffect)) {
    const decision = callOptions.approval;
    if (decision === undefined || decision.state === "pending") {
      const approval = createApproval({
        invocationId: options.invocationId,
        toolCallId: call.toolCallId,
        toolId: tool.id,
        sideEffect: tool.sideEffect,
        policy: tool.approval,
      }) as PendingApproval;
      return { status: "approval-required", approval };
    }
    if (decision.state === "denied") {
      return denied(call, "RELKIT_AGENT_TOOL_DENIED", "The tool call was denied.");
    }
  }
  if (options.access !== undefined) {
    const decision = await options.access({
      source: "agent",
      agentId: options.agentId,
      toolId: tool.id,
      functionId: tool.target.ref.id,
      input: call.input,
      ...(options.principal === undefined ? {} : { principal: options.principal }),
    });
    if (!decision.allowed) return denied(call, decision.code, decision.message);
  }
  try {
    const output = await invokeTool({
      tools: options.tools,
      engine: options.engine,
      toolId: tool.id,
      arguments: call.input,
      ...(callOptions.signal === undefined ? {} : { signal: callOptions.signal }),
    });
    return { status: "succeeded", toolCallId: call.toolCallId, output };
  } catch (cause) {
    const code =
      cause !== null &&
      typeof cause === "object" &&
      typeof (cause as { code?: unknown }).code === "string"
        ? (cause as { code: string }).code
        : "RELKIT_AGENT_TOOL_FAILED";
    return failed(call, code, "The tool call failed.");
  }
}

function definition(tool: ToolDescriptor<string>): AgentToolDefinition {
  const projected = getJsonSchema(tool.target.input, { direction: "input" });
  return Object.freeze({
    id: tool.id,
    name: modelToolName(tool.id),
    description: tool.description,
    inputSchema: projected.ok
      ? (projected.schema as Readonly<Record<string, unknown>>)
      : { type: "object" },
    requiresApproval: requiresApproval(tool.approval, tool.sideEffect),
  });
}

function failed(call: AgentToolCall, code: string, message: string): AgentToolOutcome {
  return { status: "failed", toolCallId: call.toolCallId, code, message };
}

function denied(call: AgentToolCall, code: string, message: string): AgentToolOutcome {
  return { status: "denied", toolCallId: call.toolCallId, code, message };
}
