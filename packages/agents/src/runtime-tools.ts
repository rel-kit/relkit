import type { JsonValue } from "@relkit/contracts";
import type { ToolSet } from "ai";
import { ApprovalRequiredError } from "./approval.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { createAiInputSchema, invokeAgentTool } from "./runtime-tool-adapter.js";
import { jsonValue, signalFailure, withSignal } from "./runtime-utils.js";
import type { ToolDescriptor, ToolSource } from "@relkit/tools";

export interface AgentToolCall {
  readonly callId: string;
  readonly toolId: string;
  readonly input: unknown;
}

export async function runTool(
  options: AgentRuntimeOptions & AgentInvocationOptions,
  turn: AgentToolCall,
  signal: AbortSignal,
  maxOutputBytes: number,
  invocationId: string,
  traceId?: string,
  parentSpanId?: string,
): Promise<JsonValue> {
  const tool = findTool(options.tools, turn.toolId);
  if (tool === undefined || !options.agent.tools.some((entry) => entry.ref.id === turn.toolId))
    return safeToolError("RELKIT_TOOL_NOT_ALLOWED");
  try {
    const result = await withSignal(
      invokeAgentTool(
        options.engine,
        tool,
        turn,
        options,
        signal,
        invocationId,
        traceId,
        parentSpanId,
      ),
      signal,
    );
    return jsonValue(result, maxOutputBytes, "tool result");
  } catch (cause) {
    if (cause instanceof ApprovalRequiredError) throw cause;
    if (signal.aborted) throw signalFailure(signal);
    return safeToolError(safeCode(cause, tool));
  }
}

export function modelTools(
  refs: readonly { readonly ref: { readonly id: string } }[],
  source: ToolSource,
  execute: (turn: AgentToolCall) => Promise<JsonValue>,
  sdk: { readonly tool: typeof import("ai").tool },
): ToolSet {
  return Object.fromEntries(
    refs.map((ref) => {
      const tool = findTool(source, ref.ref.id);
      if (tool === undefined)
        throw new AgentRuntimeError("RELKIT_TOOL_UNKNOWN", "Agent tool is not registered");
      return [
        tool.id,
        sdk.tool({
          description: tool.description,
          inputSchema: createAiInputSchema(tool.target.input),
          execute: (input, options) =>
            execute({ callId: options.toolCallId, toolId: tool.id, input }),
        }),
      ];
    }),
  );
}

export function findTool(source: ToolSource, id: string): ToolDescriptor<string> | undefined {
  if (Array.isArray(source)) return source.find((tool) => tool.id === id);
  if (source instanceof Map)
    return source.get(id) ?? [...source.values()].find((tool) => tool.id === id);
  const record = source as Readonly<Record<string, ToolDescriptor<string>>>;
  return record[id] ?? Object.values(record).find((tool) => tool.id === id);
}

function safeToolError(code: string): JsonValue {
  return { error: { code, message: "Tool call failed" } };
}

function safeCode(value: unknown, tool: ToolDescriptor<string>): string {
  if (!isRecord(value) || typeof value.code !== "string") return "RELKIT_TOOL_FAILED";
  if (value.code.startsWith("RELKIT_")) return value.code;
  return tool.target.errors?.some((error) => error.id === value.code)
    ? value.code
    : "RELKIT_TOOL_FAILED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
