import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { isRecordEffect, positiveIntegerEffect } from "./agent-validation-value.js";
import { agentDefinitionFailure } from "./define-agent-error.js";
import type { AgentLimits } from "./define-agent.types.js";

/** Validates and freezes an agent's execution limits.
 * @param value - Candidate limits object.
 * @returns An Effect with limits or AgentDefinitionFailure.
 * @example Effect.runSync(copyAgentLimitsEffect({ maxSteps: 3, maxToolCalls: 2, timeoutMs: 1000 }));
 */
export const copyAgentLimitsEffect = Effect.fn("Agents.definition.copyLimits")(
  function* (value: unknown) {
    if (!(yield* isRecordEffect(value))) {
      return yield* Effect.fail(
        agentDefinitionFailure(new TypeError("Agent limits must be an object")),
      );
    }
    const record = value as Record<PropertyKey, unknown>;
    const check = (input: unknown, name: string) =>
      positiveIntegerEffect(input, name).pipe(
        Effect.mapError((error) => agentDefinitionFailure(new TypeError(error.message))),
      );
    const maxSteps = yield* check(record.maxSteps, "limits.maxSteps");
    const maxToolCalls = yield* check(record.maxToolCalls, "limits.maxToolCalls");
    const timeoutMs = yield* check(record.timeoutMs, "limits.timeoutMs");
    return Object.freeze({ maxSteps, maxToolCalls, timeoutMs }) satisfies AgentLimits;
  },
  (effect) => observeAgent("definition.copy-limits", effect),
);

/** Copies limits for existing synchronous authoring callers.
 * @param value - Candidate limits object.
 * @returns Validated immutable limits.
 * @throws The original invalid limits TypeError.
 * @example const limits = copyAgentLimits({ maxSteps: 3, maxToolCalls: 2, timeoutMs: 1000 });
 */
export function copyAgentLimits(value: unknown): AgentLimits {
  return Effect.runSync(
    copyAgentLimitsEffect(value).pipe(
      Effect.catchTag("AgentDefinitionFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}
