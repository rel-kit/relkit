import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";
import { toolStrategy, type AnyAgentMiddleware } from "langchain";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { AgentDescriptor } from "./define-agent.js";
import { hasDeepAgentCapabilities } from "./define-agent-deep.js";
import { resolveAgentPersistenceEffect } from "./graph-persistence.js";
import { AgentInvocationFailure, agentInvocationFailure } from "./runtime-effect-error.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import type {
  CreateNativeAgentOptions,
  NativeAgentRuntimeOptions,
} from "./runtime-native-agent.types.js";
import { createNativeToolsEffect, type NativeTools } from "./runtime-native-tools.js";
import { NativeToolIdentity } from "./runtime-native-tools-identity.js";
import { nativeInstructionsEffect } from "./runtime-native-support.js";
import { resolveRuntimeModelEffect } from "./runtime-model.js";

/** Materializes tools for a root or child agent.
 * @param runtime - Root runtime integrations.
 * @param options - Native invocation options.
 * @param agent - Agent whose tools are materialized.
 * @returns An Effect with native tools or AgentInvocationFailure.
 * @example Effect.runSync(createToolsForAgentEffect(runtime, options, child));
 */
export const createToolsForAgentEffect = Effect.fn("Agents.runtime.createAgentTools")(
  (
    runtime: NativeAgentRuntimeOptions,
    options: CreateNativeAgentOptions,
    agent: AgentDescriptor<string, unknown, unknown>,
  ) =>
    createNativeToolsEffect(
      { ...runtime, agent },
      options.signal,
      options.maxOutputBytes,
      options.invocationId,
      options.traceId,
    ),
  (effect) => observeAgent("runtime.create-agent-tools", effect),
);

/** Creates the native structured output strategy.
 * @param schema - Authored output validator.
 * @returns An Effect with a strategy or AgentInvocationFailure.
 * @example Effect.runSync(responseFormatEffect(output));
 */
export const responseFormatEffect = Effect.fn("Agents.runtime.responseFormat")(
  (schema: StandardSchemaV1) =>
    Effect.try({
      try: () => {
        const projection = getJsonSchema(schema);
        if (!projection.ok) {
          throw new AgentRuntimeError(
            "RELKIT_SCHEMA_UNAVAILABLE",
            "Agent output schema is unavailable",
          );
        }
        return toolStrategy(
          {
            title: "relkit_output",
            type: "object",
            properties: { value: projection.schema },
            required: ["value"],
            additionalProperties: false,
          },
          { handleError: false },
        );
      },
      catch: agentInvocationFailure,
    }),
  (effect) => observeAgent("runtime.response-format", effect),
);

/** Resolves a child model or inherits its parent model.
 * @param child - Child descriptor.
 * @param inherited - Parent model.
 * @param runtime - Model registry and environment.
 * @returns An Effect with a native model or AgentInvocationFailure.
 * @example await Effect.runPromise(childModelEffect(child, model, runtime));
 */
export const childModelEffect = Effect.fn("Agents.runtime.childModel")(
  function* (
    child: AgentDescriptor<string, unknown, unknown>,
    inherited: string | LanguageModelLike,
    runtime: NativeAgentRuntimeOptions,
  ) {
    if (child.model === undefined) return inherited;
    const resolved = yield* resolveRuntimeModelEffect({
      model: child.model,
      registry: runtime.modelRegistry,
      environment: runtime.environment ?? {},
    }).pipe(Effect.mapError((failure) => agentInvocationFailure(failure.cause)));
    return resolved.model;
  },
  (effect) => observeAgent("runtime.child-model", effect),
);

/** Builds child and nested DeepAgents declarations in authored order.
 * @param children - Child descriptors.
 * @param inheritedModel - Parent model.
 * @param inheritedBackend - Parent bucket backend.
 * @param runtime - Root runtime integrations.
 * @param options - Native invocation options.
 * @param groups - Mutable tool groups retained by the root agent.
 * @param deepagents - Loaded DeepAgents module.
 * @param limitMiddleware - Shared invocation limit middleware.
 * @returns An Effect with child declarations or AgentInvocationFailure.
 * @example await Effect.runPromise(createSubagentsEffect(children, model, backend, runtime, options, groups, deepagents, limits));
 */
export const createSubagentsEffect = Effect.fn("Agents.runtime.createSubagents")(
  (
    children: readonly AgentDescriptor<string, unknown, unknown>[],
    inheritedModel: string | LanguageModelLike,
    inheritedBackend: unknown,
    runtime: NativeAgentRuntimeOptions,
    options: CreateNativeAgentOptions,
    groups: NativeTools[],
    deepagents: typeof import("deepagents"),
    limitMiddleware: AnyAgentMiddleware,
  ) =>
    createSubagentsCore(
      children,
      inheritedModel,
      inheritedBackend,
      runtime,
      options,
      groups,
      deepagents,
      limitMiddleware,
    ),
  (effect) => observeAgent("runtime.create-subagents", effect),
);

function createSubagentsCore(
  children: readonly AgentDescriptor<string, unknown, unknown>[],
  inheritedModel: string | LanguageModelLike,
  inheritedBackend: unknown,
  runtime: NativeAgentRuntimeOptions,
  options: CreateNativeAgentOptions,
  groups: NativeTools[],
  deepagents: typeof import("deepagents"),
  limitMiddleware: AnyAgentMiddleware,
): Effect.Effect<unknown[], AgentInvocationFailure, NativeToolIdentity> {
  return Effect.gen(function* () {
    const subagents: unknown[] = [];
    for (const child of children) {
      const childTools = yield* createToolsForAgentEffect(runtime, options, child);
      groups.push(childTools);
      const model = yield* childModelEffect(child, inheritedModel, runtime);
      const instructions = yield* nativeInstructionsEffect(child);
      const format = yield* responseFormatEffect(child.output);
      const common = {
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
      if (!hasDeepAgentCapabilities(child)) {
        subagents.push({ ...common, description: child.description ?? child.title ?? child.id });
        continue;
      }
      const backend = child.backend ?? inheritedBackend;
      const persistence = yield* resolveAgentPersistenceEffect(
        child,
        runtime.environment ?? {},
      ).pipe(Effect.mapError((failure) => agentInvocationFailure(failure.cause)));
      const nested = yield* createSubagentsCore(
        child.subagents ?? [],
        model,
        backend,
        runtime,
        options,
        groups,
        deepagents,
        limitMiddleware,
      );
      subagents.push(
        yield* Effect.try({
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
    }
    return subagents;
  });
}
