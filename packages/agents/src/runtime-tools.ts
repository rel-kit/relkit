import type { JsonValue } from "@relkit/contracts";
import { ApprovalRequiredError } from "./approval.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { invokeAgentTool } from "./runtime-tool-adapter.js";
import { jsonValue, signalFailure, withSignal } from "./runtime-utils.js";
import type { ToolDescriptor, ToolSource } from "@relkit/tools";
import { relkitToolRefs } from "./define-agent-native.js";

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
  if (
    tool === undefined ||
    !relkitToolRefs(options.agent.tools).some((entry) => entry.ref.id === turn.toolId)
  )
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

export function modelToolName(id: string, index: number): string {
  const suffix = `_${index}`;
  return `${id.replaceAll(".", "_").slice(0, 64 - suffix.length)}${suffix}`;
}

export function findModelTool(
  source: ToolSource,
  refs: readonly { readonly ref: { readonly id: string } }[],
  name: string,
): ToolDescriptor<string> | undefined {
  const direct = findTool(source, name);
  if (direct !== undefined) return direct;
  const ref = refs.find((entry, index) => modelToolName(entry.ref.id, index) === name);
  return ref === undefined ? undefined : findTool(source, ref.ref.id);
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
