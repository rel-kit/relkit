/**
 * Builds native child configurations and nested runnables after model, tools and
 * persistence have been resolved by the existing ordered subagent traversal.
 */
import type { LanguageModelLike } from "@langchain/core/language_models/base";
import type { AnyAgentMiddleware } from "langchain";
import { Effect } from "effect";
import type { AgentDescriptor } from "./define-agent.js";
import type { NativeTools } from "./runtime-native-tools.js";
import type { responseFormatEffect } from "./runtime-native-response-format.js";
import type { resolveAgentPersistenceEffect } from "./graph-persistence.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import type { AgentInvocationFailure } from "./runtime-effect-error.js";
import type { NativeNestedSubagent } from "./runtime-native-subagents.types.js";

/** Projects an already resolved child's native runnable configuration.
 * @param child - Validated native descriptor.
 * @param model - Resolved or inherited native model.
 * @param instructions - Validated native instructions.
 * @param format - Selected native structured output strategy.
 * @param childTools - Validated native tool mappings.
 * @param limitMiddleware - Shared per-invocation limits.
 * @returns The same native child configuration.
 */
export function childAgentCommon(
  child: AgentDescriptor<string, unknown, unknown>,
  model: string | LanguageModelLike,
  instructions: string,
  format: Effect.Success<ReturnType<typeof responseFormatEffect>>,
  childTools: NativeTools,
  limitMiddleware: AnyAgentMiddleware,
) {
  return {
    name: child.id,
    model,
    systemPrompt: instructions,
    tools: [...childTools.values],
    middleware: [
      ...(child.middleware as unknown as readonly AnyAgentMiddleware[]),
      limitMiddleware,
    ],
    responseFormat: format,
  };
}

/** Constructs one nested runnable with the existing native exception boundary.
 * @param child - Validated nested descriptor.
 * @param common - Already resolved native configuration.
 * @param persistence - Child-owned checkpoint/store handles.
 * @param nested - Ordered native nested children.
 * @param backend - Resolved child or inherited backend.
 * @param deepagents - Selected native DeepAgents module.
 * @returns The nested runnable declaration or the original tagged failure.
 */
export const nestedChildAgentEffect = Effect.fn("Agents.runtime.nestedChild")(
  (
    child: AgentDescriptor<string, unknown, unknown>,
    common: ReturnType<typeof childAgentCommon>,
    persistence: Effect.Success<ReturnType<typeof resolveAgentPersistenceEffect>>,
    nested: unknown[],
    backend: unknown,
    deepagents: typeof import("deepagents"),
  ): Effect.Effect<NativeNestedSubagent, AgentInvocationFailure> =>
    Effect.try({
      try: () => ({
        name: child.id,
        description: child.description ?? child.title ?? child.id,
        runnable: deepagents.createDeepAgent({
          ...common,
          ...persistence,
          subagents: nested,
          ...(child.skills === undefined ? {} : { skills: [...child.skills] }),
          ...(child.memory === undefined ? {} : { memory: [...child.memory] }),
          ...(backend === undefined ? {} : { backend }),
          ...(child.interruptOn === undefined ? {} : { interruptOn: child.interruptOn }),
        } as never),
      }),
      catch: agentInvocationFailure,
    }),
);
