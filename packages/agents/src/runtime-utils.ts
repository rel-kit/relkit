import { canonicalJson, type JsonValue } from "@zsys/contracts";
import { getJsonSchema, validate, type StandardSchemaV1 } from "@zsys/schema";
import {
  assertApprovalGranted,
  approveApproval,
  createApproval,
  denyApproval,
  ApprovalRequiredError,
  type ApprovalRecord,
} from "./approval.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import type { ModelTurn } from "./model-provider.js";
import { invokeTool, resolveToolTarget, type ToolDescriptor, type ToolSource } from "@zsys/tools";
import { createExecutionSignal, signalFailure, withSignal } from "./signal.js";
export { createExecutionSignal, signalFailure, withSignal };
export async function runTool(
  options: AgentRuntimeOptions & AgentInvocationOptions,
  turn: Extract<ModelTurn, { readonly type: "tool-call" }>,
  signal: AbortSignal,
  maxOutputBytes: number,
  invocationId: string,
  traceId?: string,
  parentSpanId?: string,
): Promise<JsonValue> {
  const tool = findTool(options.tools, turn.toolId);
  if (tool === undefined || !options.agent.tools.some((entry) => entry.ref.id === turn.toolId))
    return safeToolError("ZSYS_TOOL_NOT_ALLOWED");
  try {
    const approval = createApproval({
      invocationId,
      toolCallId: turn.callId,
      toolId: tool.id,
      sideEffect: tool.sideEffect,
      policy: tool.approval,
    });
    let decision: ApprovalRecord = approval;
    if (approval.state === "pending") {
      const handler = options.approval;
      if (handler === undefined) assertApprovalGranted(approval);
      else {
        const response = await withSignal(handler(approval), signal);
        decision =
          response === "approved" || response === true
            ? approveApproval(approval)
            : response === "denied" || response === false
              ? denyApproval(approval)
              : response;
        assertApprovalGranted(decision);
      }
    }
    const result = await withSignal(
      invokeTool({
        tools: options.tools,
        engine: options.engine,
        allowedTools: options.agent.tools,
        toolId: turn.toolId,
        arguments: turn.input,
        signal,
        hooks: options.hooks,
        parent: {
          id: invocationId,
          ...(traceId === undefined ? {} : { traceId }),
          ...(parentSpanId === undefined ? {} : { spanId: parentSpanId }),
          signal,
        },
      }),
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
): readonly { readonly id: string; readonly description: string; readonly input: JsonValue }[] {
  return refs.map((ref) => {
    const tool = findTool(source, ref.ref.id);
    if (tool === undefined)
      throw new AgentRuntimeError("ZSYS_TOOL_UNKNOWN", "Agent tool is not registered");
    const projection = getJsonSchema(resolveToolTarget(tool).input);
    if (!projection.ok)
      throw new AgentRuntimeError("ZSYS_SCHEMA_UNAVAILABLE", "Tool input schema is unavailable");
    return { id: tool.id, description: tool.description, input: projection.schema };
  });
}

export function findTool(source: ToolSource, id: string): ToolDescriptor<string> | undefined {
  if (Array.isArray(source)) return source.find((tool) => tool.id === id);
  if (source instanceof Map)
    return source.get(id) ?? [...source.values()].find((tool) => tool.id === id);
  const record = source as Readonly<Record<string, ToolDescriptor<string>>>;
  return record[id] ?? Object.values(record).find((tool) => tool.id === id);
}

export async function validateValue(
  schema: StandardSchemaV1,
  value: unknown,
  phase: "input" | "output",
): Promise<unknown> {
  try {
    const result = await validate(schema, value as never);
    if (!("value" in result))
      throw new AgentRuntimeError(
        phase === "input" ? "ZSYS_AGENT_INPUT_VALIDATION" : "ZSYS_AGENT_OUTPUT_VALIDATION",
        `${phase === "input" ? "Input" : "Output"} validation failed`,
        result.issues,
      );
    return result.value;
  } catch (cause) {
    if (cause instanceof AgentRuntimeError) throw cause;
    throw new AgentRuntimeError(
      phase === "input" ? "ZSYS_AGENT_INPUT_VALIDATION" : "ZSYS_AGENT_OUTPUT_VALIDATION",
      `${phase === "input" ? "Input" : "Output"} validation failed`,
    );
  }
}

export function jsonValue(value: unknown, maxBytes: number, label: string): JsonValue {
  try {
    const serialized = canonicalJson(value);
    if (new TextEncoder().encode(serialized).byteLength > maxBytes)
      throw new AgentRuntimeError("ZSYS_AGENT_RESPONSE_LIMIT", `${label} exceeds its byte limit`);
    return JSON.parse(serialized) as JsonValue;
  } catch (cause) {
    if (cause instanceof AgentRuntimeError) throw cause;
    throw new AgentRuntimeError("ZSYS_AGENT_JSON_INVALID", `${label} is not JSON-safe`);
  }
}

function safeToolError(code: string): JsonValue {
  return {
    error: {
      code,
      message: "Tool call failed",
    },
  };
}

function safeCode(value: unknown, tool: ToolDescriptor<string>): string {
  if (!isRecord(value) || typeof value.code !== "string") return "ZSYS_TOOL_FAILED";
  if (value.code.startsWith("ZSYS_")) return value.code;
  return tool.target.errors?.some((error) => error.id === value.code)
    ? value.code
    : "ZSYS_TOOL_FAILED";
}

export function modelFailure(cause: unknown, signal: AbortSignal): AgentRuntimeError {
  if (signal.aborted) return signalFailure(signal);
  return cause instanceof AgentRuntimeError && cause.code === "ZSYS_AGENT_RESPONSE_LIMIT"
    ? cause
    : new AgentRuntimeError("ZSYS_AGENT_MODEL_ERROR", "Model response was invalid or unavailable");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
