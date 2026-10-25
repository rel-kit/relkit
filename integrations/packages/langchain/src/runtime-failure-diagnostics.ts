/** Records bounded failure categories at the invocation boundary; native causes remain private and are never logged raw. */
import { Effect } from "effect";
import { GraphInterruptedError } from "./graph-interruption.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import type { AgentInvocationFailure } from "./runtime-effect-error.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.types.js";

const codes = new Set([
  "RELKIT_AGENT_INPUT_VALIDATION",
  "RELKIT_AGENT_OUTPUT_VALIDATION",
  "RELKIT_AGENT_MODEL_ERROR",
  "RELKIT_AGENT_MODEL_UNAVAILABLE",
  "RELKIT_AGENT_RESPONSE_LIMIT",
  "RELKIT_AGENT_STEP_LIMIT",
  "RELKIT_AGENT_TOOL_LIMIT",
  "RELKIT_AGENT_TIMEOUT",
  "RELKIT_AGENT_JSON_INVALID",
  "RELKIT_AGENT_LIMIT_INVALID",
  "RELKIT_SCHEMA_UNAVAILABLE",
  "RELKIT_TOOL_UNKNOWN",
]);
const nativeNames = new Set([
  "Error",
  "TypeError",
  "SyntaxError",
  "RangeError",
  "APIError",
  "BadRequestError",
  "AuthenticationError",
  "PermissionDeniedError",
  "NotFoundError",
  "ConflictError",
  "UnprocessableEntityError",
  "RateLimitError",
  "InternalServerError",
  "APIConnectionError",
  "APIConnectionTimeoutError",
  "StructuredOutputParsingError",
]);

/** Logs one safe diagnostic before public failure mapping, without retrying execution.
 * @param failure - Typed invocation failure retaining the private cause.
 * @param options - Authored agent and invocation identities; input/output are excluded.
 * @returns Logging effect, or no operation for waiting/cancelled control flow. */
export function logAgentFailure(
  failure: AgentInvocationFailure,
  options: AgentRuntimeOptions & AgentInvocationOptions,
) {
  const cause = failure.cause;
  if (cause instanceof GraphInterruptedError) return Effect.void;
  if (cause instanceof AgentRuntimeError && cause.code === "RELKIT_AGENT_CANCELLED")
    return Effect.void;
  const native = cause instanceof Error && cause.cause instanceof Error ? cause.cause : cause;
  const status = native instanceof Error && "status" in native ? native.status : undefined;
  return Effect.logError("Agent invocation failed", {
    agentId: options.agent.id,
    invocationId: options.invocationId,
    traceId: options.traceId,
    threadId: options.threadId,
    code: codes.has(failure.code) ? failure.code : "RELKIT_AGENT_INVOCATION_FAILED",
    nativeType:
      native instanceof Error && nativeNames.has(native.name) ? native.name : "unclassified",
    ...(typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599
      ? { providerStatus: status }
      : {}),
  });
}
