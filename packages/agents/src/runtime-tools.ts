import type { JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { ApprovalRequiredError } from "./approval.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { invokeAgentToolEffect } from "./runtime-tool-adapter.js";
import { jsonValueEffect, signalFailure } from "./runtime-utils.js";
import type { ToolDescriptor } from "@relkit/tools";
import { relkitToolRefs } from "./define-agent-native.js";
import { findToolEffect } from "./runtime-tool-lookup.js";
import type { AgentToolCall } from "./runtime-tools.types.js";

export type { AgentToolCall } from "./runtime-tools.types.js";
export {
  findModelTool,
  findModelToolEffect,
  findTool,
  findToolEffect,
  modelToolName,
  modelToolNameEffect,
} from "./runtime-tool-lookup.js";

/** Executes an allowed RELKIT tool with safe public error projection.
 * @param options - Runtime and invocation integrations.
 * @param turn - Model requested tool call.
 * @param signal - Invocation cancellation signal.
 * @param maxOutputBytes - Maximum serialized result size.
 * @param invocationId - Stable invocation identity.
 * @param traceId - Optional trace identity.
 * @param parentSpanId - Optional parent trace span.
 * @returns An Effect with JSON result or AgentInvocationFailure for control errors.
 * @example await Effect.runPromise(runToolEffect(options, turn, signal, 1024, id));
 */
export const runToolEffect = Effect.fn("Agents.runtime.runTool")(
  function* (
    options: AgentRuntimeOptions & AgentInvocationOptions,
    turn: AgentToolCall,
    signal: AbortSignal,
    maxOutputBytes: number,
    invocationId: string,
    traceId?: string,
    parentSpanId?: string,
  ) {
    const tool = yield* findToolEffect(options.tools, turn.toolId);
    if (
      tool === undefined ||
      !relkitToolRefs(options.agent.tools).some((entry) => entry.ref.id === turn.toolId)
    ) {
      return safeToolError("RELKIT_TOOL_NOT_ALLOWED");
    }
    const outcome = yield* invokeAgentToolEffect(
      options.engine,
      tool,
      turn,
      options,
      signal,
      invocationId,
      traceId,
      parentSpanId,
    ).pipe(
      Effect.map((value) => ({ kind: "result" as const, value })),
      Effect.catchTag("AgentInvocationFailure", (failure) => {
        const cause = failure.cause;
        if (cause instanceof ApprovalRequiredError) return Effect.fail(failure);
        if (signal.aborted) return Effect.fail(agentInvocationFailure(signalFailure(signal)));
        return Effect.succeed({
          kind: "error" as const,
          value: safeToolError(safeCode(cause, tool)),
        });
      }),
    );
    if (outcome.kind === "error") return outcome.value;
    return yield* jsonValueEffect(outcome.value, maxOutputBytes, "tool result").pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => {
        if (signal.aborted) return Effect.fail(agentInvocationFailure(signalFailure(signal)));
        return Effect.succeed(safeToolError(safeCode(failure.cause, tool)));
      }),
    );
  },
  (effect) => observeAgent("runtime.run-tool", effect),
);

/** Executes a tool for existing Promise callers.
 * @param options - Runtime and invocation integrations.
 * @param turn - Model requested tool call.
 * @param signal - Invocation cancellation signal.
 * @param maxOutputBytes - Maximum serialized result size.
 * @param invocationId - Stable invocation identity.
 * @param traceId - Optional trace identity.
 * @param parentSpanId - Optional parent trace span.
 * @returns Safe JSON result.
 * @throws ApprovalRequiredError or AgentRuntimeError for cancellation.
 * @example await runTool(options, turn, signal, 1024, id);
 */
export function runTool(
  options: AgentRuntimeOptions & AgentInvocationOptions,
  turn: AgentToolCall,
  signal: AbortSignal,
  maxOutputBytes: number,
  invocationId: string,
  traceId?: string,
  parentSpanId?: string,
): Promise<JsonValue> {
  return Effect.runPromise(
    runToolEffect(options, turn, signal, maxOutputBytes, invocationId, traceId, parentSpanId).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    ),
    { signal },
  );
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
