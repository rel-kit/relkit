import { createAgent, StructuredOutputParsingError, type AnyAgentMiddleware } from "langchain";
import { Effect, Layer } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { hasDeepAgentCapabilities } from "./define-agent-deep.js";
import { createThreadBucketBackendEffect } from "./deepagent-bucket-scope.js";
import { resolveAgentPersistenceEffect } from "./graph-persistence.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import {
  createSubagentsEffect,
  createToolsForAgentEffect,
  responseFormatEffect,
} from "./runtime-native-agent-build.js";
import type { CreateNativeAgentOptions, NativeAgent } from "./runtime-native-agent.types.js";
import { createNativeLimitMiddlewareEffect } from "./runtime-native-limits.js";
import { NativeToolIdentityLive } from "./runtime-native-tools-identity.js";
import type { NativeTools } from "./runtime-native-tools.js";
import {
  combineNativeToolsEffect,
  DeepAgentsLoaderLive,
  loadDeepAgentsEffect,
  nativeInstructionsEffect,
} from "./runtime-native-support.js";

export { StructuredOutputParsingError };
export type { CreateNativeAgentOptions, NativeAgent } from "./runtime-native-agent.types.js";

/** Builds a native LangChain or DeepAgents runnable for one invocation.
 * @param options - Runtime, model, signal, and invocation identity.
 * @returns An Effect with native agent and tools or AgentInvocationFailure.
 * @example await Effect.runPromise(Effect.provide(createNativeAgentEffect(options), Layer.merge(DeepAgentsLoaderLive, NativeToolIdentityLive)));
 */
export const createNativeAgentEffect = Effect.fn("Agents.runtime.createNativeAgent")(
  function* (options: CreateNativeAgentOptions) {
    const { runtime } = options;
    const tools = yield* createToolsForAgentEffect(runtime, options, runtime.agent);
    const persistence = yield* resolveAgentPersistenceEffect(
      runtime.agent,
      runtime.environment ?? {},
    ).pipe(Effect.mapError((failure) => agentInvocationFailure(failure.cause)));
    const limitMiddleware = yield* createNativeLimitMiddlewareEffect(runtime.agent.limits);
    const instructions = yield* nativeInstructionsEffect(runtime.agent);
    const format = yield* responseFormatEffect(runtime.agent.output);
    const common = {
      name: runtime.agent.id,
      model: options.model,
      systemPrompt: instructions,
      tools: [...tools.values],
      middleware: [
        ...(runtime.agent.middleware as unknown as readonly AnyAgentMiddleware[]),
        limitMiddleware,
      ],
      responseFormat: format,
      ...persistence,
    };
    if (!hasDeepAgentCapabilities(runtime.agent)) {
      const agent = yield* Effect.try({
        try: () => createAgent(common),
        catch: agentInvocationFailure,
      });
      return { agent, tools };
    }
    const deepagents = yield* loadDeepAgentsEffect();
    const backend =
      runtime.bucketBackend === undefined
        ? runtime.agent.backend
        : yield* createThreadBucketBackendEffect(
            runtime.bucketBackend,
            runtime.agent.id,
            runtime.threadId ?? "",
          ).pipe(Effect.mapError((failure) => agentInvocationFailure(failure.cause)));
    const groups = [tools];
    const subagents = yield* createSubagentsEffect(
      runtime.agent.subagents ?? [],
      options.model,
      backend,
      runtime,
      options,
      groups,
      deepagents,
      limitMiddleware,
    );
    const agent = yield* Effect.try({
      try: () =>
        deepagents.createDeepAgent({
          ...common,
          subagents,
          ...(runtime.agent.skills === undefined ? {} : { skills: [...runtime.agent.skills] }),
          ...(runtime.agent.memory === undefined ? {} : { memory: [...runtime.agent.memory] }),
          ...(backend === undefined ? {} : { backend }),
          ...(runtime.agent.interruptOn === undefined
            ? {}
            : { interruptOn: runtime.agent.interruptOn }),
        } as never) as unknown as NativeAgent,
      catch: agentInvocationFailure,
    });
    return { agent, tools: yield* combineNativeToolsEffect(groups) };
  },
  (effect) => observeAgent("runtime.create-native-agent", effect),
);

/** Builds a native agent for existing Promise callers.
 * @param options - Runtime, model, signal, and invocation identity.
 * @returns Native agent and public tool mappings.
 * @throws The original model, schema, persistence, or dependency error.
 * @example await createNativeAgent(options);
 */
export function createNativeAgent(options: CreateNativeAgentOptions): Promise<{
  readonly agent: NativeAgent;
  readonly tools: NativeTools;
}> {
  return Effect.runPromise(
    createNativeAgentEffect(options).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
      Effect.provide(Layer.merge(DeepAgentsLoaderLive, NativeToolIdentityLive)),
    ),
    { signal: options.signal },
  );
}
