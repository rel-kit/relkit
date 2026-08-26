import { getJsonSchema } from "@zsys/schema";
import { ApprovalRequiredError } from "./approval.js";
import type { AgentCapturePolicy } from "./observability.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";
import {
  jsonValue,
  modelFailure,
  signalFailure,
  validateValue,
  withSignal,
} from "./runtime-utils.js";
import { modelTools, runTool, type AgentToolCall } from "./runtime-tools.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { createLoopTelemetry } from "./runtime-loop-telemetry.js";

type AgentOptions = AgentRuntimeOptions & AgentInvocationOptions;

export async function runAgentLoop(
  options: AgentOptions,
  model: import("ai").LanguageModel,
  modelId: string,
  signal: AbortSignal,
  input: unknown,
  maxInputBytes: number,
  maxOutputBytes: number,
  invocationId: string,
  traceId: string,
  agentSpanId: string,
  capture: AgentCapturePolicy,
): Promise<unknown> {
  const sdk = await import("ai");
  let toolCalls = 0;
  let fatalToolError: unknown;
  const telemetry = createLoopTelemetry({
    runtime: options,
    input,
    instructions: instructions(options),
    modelId,
    invocationId,
    traceId,
    agentSpanId,
    capture,
    signal,
  });
  const execute = async (turn: AgentToolCall) => {
    toolCalls += 1;
    if (toolCalls > options.agent.limits.maxToolCalls) {
      fatalToolError = new AgentRuntimeError(
        "ZSYS_AGENT_TOOL_LIMIT",
        "Agent tool-call limit reached",
      );
      throw fatalToolError;
    }
    try {
      return await runTool(
        options,
        turn,
        signal,
        maxOutputBytes,
        invocationId,
        traceId,
        telemetry.toolSpanId(turn.callId),
      );
    } catch (cause) {
      if (cause instanceof ApprovalRequiredError) fatalToolError = cause;
      throw cause;
    }
  };
  const outputProjection = getJsonSchema(options.agent.output);
  if (!outputProjection.ok) {
    throw new AgentRuntimeError("ZSYS_SCHEMA_UNAVAILABLE", "Agent output schema is unavailable");
  }
  const agent = new sdk.ToolLoopAgent({
    id: options.agent.id,
    model,
    instructions: instructions(options),
    tools: modelTools(options.agent.tools, options.tools, execute, sdk),
    maxRetries: 0,
    output: sdk.Output.object({ schema: sdk.jsonSchema(outputProjection.schema as never) }),
    stopWhen: ({ steps }) =>
      fatalToolError !== undefined || steps.length >= options.agent.limits.maxSteps,
    onStepStart: telemetry.onStepStart,
    onToolExecutionStart: telemetry.onToolExecutionStart,
    onToolExecutionEnd: telemetry.onToolExecutionEnd,
    onStepEnd: telemetry.onStepEnd,
  });
  try {
    const result = await withSignal(
      agent.generate({
        prompt: JSON.stringify(jsonValue(input, maxInputBytes, "agent input")),
        abortSignal: signal,
      }),
      signal,
    );
    if (fatalToolError !== undefined) throw fatalToolError;
    if (
      result.steps.length >= options.agent.limits.maxSteps &&
      result.finishReason === "tool-calls"
    ) {
      throw new AgentRuntimeError("ZSYS_AGENT_STEP_LIMIT", "Agent step limit reached");
    }
    return validateValue(
      options.agent.output,
      jsonValue(result.output, maxOutputBytes, "agent output"),
      "output",
    );
  } catch (cause) {
    telemetry.close(cause, signal);
    if (signal.aborted) throw signalFailure(signal);
    if (fatalToolError !== undefined) throw fatalToolError;
    if (cause instanceof AgentRuntimeError) throw cause;
    if (sdk.NoObjectGeneratedError.isInstance(cause)) {
      throw new AgentRuntimeError("ZSYS_AGENT_OUTPUT_VALIDATION", "Output validation failed");
    }
    throw modelFailure(cause, signal);
  }
}

function instructions(options: AgentOptions): string {
  const value = options.agent.instructions;
  if (typeof value === "string") return value;
  if ("template" in value) return value.template;
  return typeof value.value === "string" ? value.value : value.value.join("\n\n");
}
