import { canonicalJson, type JsonValue } from "@zsys/contracts";
import { validate, type StandardSchemaV1 } from "@zsys/schema";
import { AgentRuntimeError } from "./runtime-errors.js";
import { createExecutionSignal, signalFailure, withSignal } from "./signal.js";
export { createExecutionSignal, signalFailure, withSignal };

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

export function modelFailure(cause: unknown, signal: AbortSignal): AgentRuntimeError {
  if (signal.aborted) return signalFailure(signal);
  return cause instanceof AgentRuntimeError && cause.code === "ZSYS_AGENT_RESPONSE_LIMIT"
    ? cause
    : new AgentRuntimeError("ZSYS_AGENT_MODEL_ERROR", "Model response was invalid or unavailable");
}
