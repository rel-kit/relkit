import { canonicalJson, type JsonValue } from "@relkit/contracts";
import { validate, type StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { createExecutionSignal, signalFailure, withSignal } from "./signal.js";
export { createExecutionSignal, signalFailure, withSignal };

/** Validates an invocation value through a Standard Schema.
 * @param schema - Input or output validator.
 * @param value - Candidate value.
 * @param phase - Validation phase for public error codes.
 * @returns An Effect with validated value or AgentInvocationFailure.
 * @example await Effect.runPromise(validateValueEffect(schema, input, "input"));
 */
export const validateValueEffect = Effect.fn("Agents.runtime.validateValue")(
  (schema: StandardSchemaV1, value: unknown, phase: "input" | "output") =>
    Effect.tryPromise({
      try: () => validateValueCore(schema, value, phase),
      catch: agentInvocationFailure,
    }),
  (effect) => observeAgent("runtime.validate-value", effect),
);

/** Validates an invocation value for existing Promise callers.
 * @param schema - Input or output validator.
 * @param value - Candidate value.
 * @param phase - Validation phase for public error codes.
 * @returns Validated input or output.
 * @throws AgentRuntimeError for invalid values.
 * @example await validateValue(schema, input, "input");
 */
export function validateValue(
  schema: StandardSchemaV1,
  value: unknown,
  phase: "input" | "output",
): Promise<unknown> {
  return Effect.runPromise(
    validateValueEffect(schema, value, phase).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

async function validateValueCore(
  schema: StandardSchemaV1,
  value: unknown,
  phase: "input" | "output",
): Promise<unknown> {
  try {
    const result = await validate(schema, value as never);
    if (!("value" in result))
      throw new AgentRuntimeError(
        phase === "input" ? "RELKIT_AGENT_INPUT_VALIDATION" : "RELKIT_AGENT_OUTPUT_VALIDATION",
        `${phase === "input" ? "Input" : "Output"} validation failed`,
        result.issues,
      );
    return result.value;
  } catch (cause) {
    if (cause instanceof AgentRuntimeError) throw cause;
    throw new AgentRuntimeError(
      phase === "input" ? "RELKIT_AGENT_INPUT_VALIDATION" : "RELKIT_AGENT_OUTPUT_VALIDATION",
      `${phase === "input" ? "Input" : "Output"} validation failed`,
    );
  }
}

/** Produces bounded, canonical JSON from a runtime value.
 * @param value - Candidate JSON value.
 * @param maxBytes - Maximum encoded byte length.
 * @param label - Stable error subject.
 * @returns An Effect with JSON or AgentInvocationFailure.
 * @example Effect.runSync(jsonValueEffect({ ok: true }, 1024, "output"));
 */
export const jsonValueEffect = Effect.fn("Agents.runtime.jsonValue")(
  (value: unknown, maxBytes: number, label: string) =>
    Effect.try({ try: () => jsonValueCore(value, maxBytes, label), catch: agentInvocationFailure }),
  (effect) => observeAgent("runtime.json-value", effect),
);

/** Produces bounded JSON for existing synchronous callers.
 * @param value - Candidate JSON value.
 * @param maxBytes - Maximum encoded byte length.
 * @param label - Stable error subject.
 * @returns Canonical JSON.
 * @throws AgentRuntimeError for invalid JSON or byte limits.
 * @example jsonValue({ ok: true }, 1024, "output");
 */
export function jsonValue(value: unknown, maxBytes: number, label: string): JsonValue {
  return Effect.runSync(
    jsonValueEffect(value, maxBytes, label).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

function jsonValueCore(value: unknown, maxBytes: number, label: string): JsonValue {
  try {
    const serialized = canonicalJson(value);
    if (new TextEncoder().encode(serialized).byteLength > maxBytes)
      throw new AgentRuntimeError("RELKIT_AGENT_RESPONSE_LIMIT", `${label} exceeds its byte limit`);
    return JSON.parse(serialized) as JsonValue;
  } catch (cause) {
    if (cause instanceof AgentRuntimeError) throw cause;
    throw new AgentRuntimeError("RELKIT_AGENT_JSON_INVALID", `${label} is not JSON-safe`);
  }
}

/** Classifies a model failure without exposing provider details.
 * @param cause - Provider or response failure.
 * @param signal - Invocation cancellation signal.
 * @returns An Effect with a safe AgentRuntimeError.
 * @example Effect.runSync(modelFailureEffect(error, signal));
 */
export const modelFailureEffect = Effect.fn("Agents.runtime.modelFailure")(
  (cause: unknown, signal: AbortSignal) => Effect.sync(() => modelFailureCore(cause, signal)),
  (effect) => observeAgent("runtime.model-failure", effect),
);

/** Classifies a model failure for existing synchronous callers.
 * @param cause - Provider or response failure.
 * @param signal - Invocation cancellation signal.
 * @returns A safe AgentRuntimeError.
 * @example modelFailure(error, signal);
 */
export function modelFailure(cause: unknown, signal: AbortSignal): AgentRuntimeError {
  return Effect.runSync(modelFailureEffect(cause, signal));
}

function modelFailureCore(cause: unknown, signal: AbortSignal): AgentRuntimeError {
  if (signal.aborted) return signalFailure(signal);
  return cause instanceof AgentRuntimeError && cause.code === "RELKIT_AGENT_RESPONSE_LIMIT"
    ? cause
    : new AgentRuntimeError(
        "RELKIT_AGENT_MODEL_ERROR",
        "Model response was invalid or unavailable",
      );
}
