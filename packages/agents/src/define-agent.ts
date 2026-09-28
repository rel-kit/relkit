import { createUnboundIdentityEffect } from "@relkit/invocation";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { isRecordEffect } from "./agent-validation-value.js";
import { prepareAgentDescriptor } from "./define-agent-build.js";
import { agentDefinitionFailure } from "./define-agent-error.js";
import type { AgentMiddleware, AgentTool } from "./define-agent-native.types.js";
import type { AgentDescriptor, DefineAgentOptions } from "./define-agent.types.js";

export { assertAgentDescriptor, isAgentDescriptor } from "./define-agent-validation.js";
export { copyAgentLimits, copyAgentLimitsEffect } from "./define-agent-limits.js";
export type {
  AgentClientStateKey,
  AgentMiddleware,
  AgentMiddlewareState,
  AgentModel,
  AgentModelFactory,
  AgentTool,
  NativeAgentTool,
} from "./define-agent-native.types.js";
export type { AgentChatMapping, AgentClientPolicy, AgentControl } from "./agent-client.js";
export type { AgentFilesystemBackend, AgentSubagent, DeepAgentCapabilities } from "./define-agent-deep.types.js";
export type {
  AgentDescriptor,
  AgentInstructions,
  AgentLimits,
  DefineAgentOptions,
  PromptInstructions,
  PromptTemplate,
} from "./define-agent.types.js";

/** Defines a native agent with validated authoring options and substitutable identity generation.
 * @param options - Schemas, model, tools, middleware, limits, and client metadata.
 * @returns An Effect with a frozen agent descriptor or AgentDefinitionFailure.
 * @example Effect.runSync(defineAgentEffect({ id: "support", input, output, instructions: "Reply.", tools: [], limits }));
 */
export const defineAgentEffect = Effect.fn("Agents.definition.define")(
  function* <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const OutputSchema extends StandardSchemaV1,
    const Middleware extends readonly AgentMiddleware[] = readonly [],
    const Tools extends readonly AgentTool[] = readonly AgentTool[],
  >(options: DefineAgentOptions<Id, InputSchema, OutputSchema, Middleware, Tools>) {
    if (!(yield* isRecordEffect(options))) {
      return yield* Effect.fail(agentDefinitionFailure(new TypeError("Agent options must be an object")));
    }
    if (Object.hasOwn(options, "handler")) {
      return yield* Effect.fail(agentDefinitionFailure(new TypeError("Agents cannot own handlers")));
    }
    const assemble = yield* Effect.try({
      try: () => prepareAgentDescriptor(options),
      catch: agentDefinitionFailure,
    });
    const id = options.id === undefined
      ? yield* createUnboundIdentityEffect().pipe(
          Effect.mapError((error) => agentDefinitionFailure(error.cause)),
        )
      : options.id;
    return yield* Effect.try({
      try: () => assemble(id as Id),
      catch: agentDefinitionFailure,
    });
  },
  (effect) => observeAgent("definition.define", effect),
);

/** Defines a native agent for existing synchronous authoring callers.
 * @param options - Schemas, model, tools, middleware, limits, and client metadata.
 * @returns A frozen agent descriptor.
 * @throws The original invalid authoring or identity error.
 * @example
 * ```ts
 * import { defineAgent } from "@relkit/app/agents";
 * import { z } from "@relkit/app/schema";
 *
 * const support = defineAgent({
 *   id: "support",
 *   input: z.object({ message: z.string() }),
 *   output: z.object({ answer: z.string() }),
 *   instructions: "Reply briefly.",
 *   tools: [],
 *   limits: { maxSteps: 4, maxToolCalls: 2, timeoutMs: 30_000 },
 * });
 * void support;
 * ```
 * @category Agents
 * @since 0.4.0
 */
export function defineAgent<
  const Id extends string,
  const InputSchema extends StandardSchemaV1,
  const OutputSchema extends StandardSchemaV1,
  const Middleware extends readonly AgentMiddleware[] = readonly [],
  const Tools extends readonly AgentTool[] = readonly AgentTool[],
>(
  options: DefineAgentOptions<Id, InputSchema, OutputSchema, Middleware, Tools>,
): AgentDescriptor<
  Id,
  InferInput<InputSchema>,
  InferOutput<OutputSchema>,
  InputSchema,
  OutputSchema,
  Middleware,
  Tools
> {
  return Effect.runSync(defineAgentEffect(options).pipe(
    Effect.catchTag("AgentDefinitionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}
