import { createMiddleware, type AnyAgentMiddleware } from "langchain";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { AgentLimits } from "./define-agent.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { AgentRuntimeError } from "./runtime-errors.js";

/** Creates per-invocation model and tool call guards.
 * @param limits - Maximum model steps and tool calls.
 * @returns An Effect with middleware or AgentInvocationFailure.
 * @example Effect.runSync(createNativeLimitMiddlewareEffect(limits));
 */
export const createNativeLimitMiddlewareEffect = Effect.fn("Agents.runtime.nativeLimits")(
  (limits: AgentLimits) => Effect.try({
    try: (): AnyAgentMiddleware => {
      let modelCalls = 0;
      let toolCalls = 0;
      const modelGuard = Effect.fn("Agents.runtime.modelLimit")(() => Effect.try({
        try: () => {
          if (modelCalls >= limits.maxSteps) {
            throw new AgentRuntimeError("RELKIT_AGENT_STEP_LIMIT", "Agent step limit exceeded");
          }
          modelCalls += 1;
        },
        catch: agentInvocationFailure,
      }), (effect) => observeAgent("runtime.model-limit", effect));
      const toolGuard = Effect.fn("Agents.runtime.toolLimit")(() => Effect.try({
        try: () => {
          if (toolCalls >= limits.maxToolCalls) {
            throw new AgentRuntimeError("RELKIT_AGENT_TOOL_LIMIT", "Agent tool-call limit exceeded");
          }
          toolCalls += 1;
        },
        catch: agentInvocationFailure,
      }), (effect) => observeAgent("runtime.tool-limit", effect));
      const runGuard = (effect: ReturnType<typeof modelGuard>) => Effect.runSync(effect.pipe(
        Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
      ));
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
  return Effect.runSync(createNativeLimitMiddlewareEffect(limits).pipe(
    Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
  ));
}
