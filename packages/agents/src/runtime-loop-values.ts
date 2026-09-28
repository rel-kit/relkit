import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import type { AgentLoopOptions } from "./runtime-loop.types.js";
import { jsonValueEffect } from "./runtime-utils.js";

/** Builds the native message list from prior turns and validated input.
 * @param options - Invocation messages.
 * @param input - Current validated input.
 * @param maxInputBytes - Input byte cap.
 * @returns An Effect with native messages or AgentInvocationFailure.
 * @example Effect.runSync(nativeMessagesEffect(options, input, 1024));
 */
export const nativeMessagesEffect = Effect.fn("Agents.runtime.nativeMessages")(
  function* (options: AgentLoopOptions, input: unknown, maxInputBytes: number) {
    const safeInput = yield* jsonValueEffect(input, maxInputBytes, "agent input");
    return [
      ...(options.messages ?? []).map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user" as const, content: JSON.stringify(safeInput) },
    ];
  },
  (effect) => observeAgent("runtime.native-messages", effect),
);

/** Builds native messages for existing synchronous callers.
 * @param options - Invocation messages.
 * @param input - Current validated input.
 * @param maxInputBytes - Input byte cap.
 * @returns Native message list.
 * @throws The original input JSON or byte limit error.
 * @example nativeMessages(options, input, 1024);
 */
export function nativeMessages(options: AgentLoopOptions, input: unknown, maxInputBytes: number) {
  return Effect.runSync(
    nativeMessagesEffect(options, input, maxInputBytes).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

/** Extracts the structured model output value.
 * @param state - Native agent result state.
 * @returns An Effect with output or AgentInvocationFailure.
 * @example Effect.runSync(responseValueEffect(state));
 */
export const responseValueEffect = Effect.fn("Agents.runtime.responseValue")(
  (state: unknown) =>
    Effect.try({
      try: () => {
        if (
          !isRecord(state) ||
          !isRecord(state.structuredResponse) ||
          !("value" in state.structuredResponse)
        ) {
          throw new AgentRuntimeError(
            "RELKIT_AGENT_OUTPUT_VALIDATION",
            "Structured output is unavailable",
          );
        }
        return state.structuredResponse.value;
      },
      catch: agentInvocationFailure,
    }),
  (effect) => observeAgent("runtime.response-value", effect),
);

/** Extracts structured output for existing synchronous callers.
 * @param state - Native agent result state.
 * @returns Output value.
 * @throws AgentRuntimeError when structured output is absent.
 * @example responseValue(state);
 */
export function responseValue(state: unknown): unknown {
  return Effect.runSync(
    responseValueEffect(state).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

/** Unwraps nested native provider causes without looping on cyclic causes.
 * @param value - Native provider failure.
 * @returns An Effect with the deepest distinct cause.
 * @example Effect.runSync(unwrapNativeCauseEffect(error));
 */
export const unwrapNativeCauseEffect = Effect.fn("Agents.runtime.unwrapNativeCause")(
  (value: unknown) =>
    Effect.sync(() => {
      const seen = new Set<unknown>();
      let current = value;
      while (isRecord(current) && current.cause !== undefined && !seen.has(current.cause)) {
        seen.add(current);
        current = current.cause;
      }
      return current;
    }),
  (effect) => observeAgent("runtime.unwrap-native-cause", effect),
);

/** Unwraps native causes for existing synchronous callers.
 * @param value - Native provider failure.
 * @returns Deepest distinct cause.
 * @example unwrapNativeCause(error);
 */
export function unwrapNativeCause(value: unknown): unknown {
  return Effect.runSync(unwrapNativeCauseEffect(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
