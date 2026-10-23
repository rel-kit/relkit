/** Applies authored step, tool-call and timeout limits at native invocation boundaries and reports the existing limit failures. */

import { createMiddleware, type AnyAgentMiddleware } from "langchain";
import { Effect } from "effect";
import { observeAgent } from "@relkit/agents/internal/agent-telemetry";
import type { AgentLimits } from "./define-agent.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { AgentRuntimeError } from "./runtime-errors.js";

/** Creates per-invocation model and tool call guards.
 * @param limits - Maximum model steps and tool calls.
 * @returns An Effect with middleware or AgentInvocationFailure.
 * @example Effect.runSync(createNativeLimitMiddlewareEffect(limits));
 */
export const createNativeLimitMiddlewareEffect = Effect.fn("Agents.runtime.nativeLimits")(
  (limits: AgentLimits) =>
    Effect.try({
      try: (): AnyAgentMiddleware => {
        const modelGuard = createCallGuard(
          limits.maxSteps,
          "RELKIT_AGENT_STEP_LIMIT",
          "Agent step limit exceeded",
          "Agents.runtime.modelLimit",
          "runtime.model-limit",
        );
        const toolGuard = createCallGuard(
          limits.maxToolCalls,
          "RELKIT_AGENT_TOOL_LIMIT",
          "Agent tool-call limit exceeded",
          "Agents.runtime.toolLimit",
          "runtime.tool-limit",
        );
        const runGuard = (effect: ReturnType<typeof modelGuard>) =>
          Effect.runSync(
            effect.pipe(
              Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
            ),
          );
        return createMiddleware({
          name: "RelkitInvocationLimits",
          wrapModelCall: (request, handler) => {
            runGuard(modelGuard());
            return handler(request);
          },
          wrapToolCall: (request, handler) => {
            runGuard(toolGuard());
            return handler(request);
          },
        });
      },
      catch: agentInvocationFailure,
    }),
  (effect) => observeAgent("runtime.native-limits", effect),
);

/** Creates native invocation guards for existing synchronous callers.
 * @param limits - Maximum model steps and tool calls.
 * @returns LangChain middleware enforcing both limits.
 * @throws The original middleware creation error.
 * @example createNativeLimitMiddleware(limits);
 */
export function createNativeLimitMiddleware(limits: AgentLimits): AnyAgentMiddleware {
  return Effect.runSync(
    createNativeLimitMiddlewareEffect(limits).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

/** Creates one per-invocation monotonic call guard.
 * @param limit - Maximum accepted calls.
 * @param code - Existing public limit diagnostic.
 * @param message - Existing safe diagnostic text.
 * @param operation - Fixed model or tool operation span.
 * @param observation - Fixed operation telemetry label.
 * @returns A lazily observed Effect rejecting the first call beyond the limit.
 */
function createCallGuard(
  limit: number,
  code: ConstructorParameters<typeof AgentRuntimeError>[0],
  message: string,
  operation: "Agents.runtime.modelLimit" | "Agents.runtime.toolLimit",
  observation: "runtime.model-limit" | "runtime.tool-limit",
) {
  let calls = 0;
  return Effect.fn(operation)(
    () =>
      Effect.try({
        try: () => {
          if (calls >= limit) throw new AgentRuntimeError(code, message);
          calls += 1;
        },
        catch: agentInvocationFailure,
      }),
    (effect) => observeAgent(observation, effect),
  );
}
