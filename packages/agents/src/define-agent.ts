/**
 * Builds plain agent descriptors without loading an execution SDK.
 * The compiler selects native execution when an application actually declares agents.
 */
import { createUnboundIdentityEffect } from "@relkit/invocation";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { ToolRefAny } from "@relkit/tools";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { isRecordEffect } from "./agent-validation-value.js";
import { prepareAgentDescriptor } from "./define-agent-build.js";
import { agentDefinitionFailure } from "./define-agent-error.js";
import type { AgentDescriptor, DefineAgentOptions } from "./define-agent.types.js";

export { assertAgentDescriptor, isAgentDescriptor } from "./define-agent-validation.js";
export { copyAgentLimits, copyAgentLimitsEffect } from "./define-agent-limits.js";
export type * from "./define-agent.types.js";
export type { AgentChatMapping, AgentClientPolicy, AgentControl } from "./agent-client.js";

/** Validates plain authoring inputs and preserves source identity generation.
 * @param options - Schemas, selector model, RELKIT tools, limits and client policy.
 * @returns A frozen descriptor or AgentDefinitionFailure.
 */
export const defineAgentEffect = Effect.fn("Agents.definition.define")(
  function* <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const OutputSchema extends StandardSchemaV1,
    const Tools extends readonly ToolRefAny[],
  >(options: DefineAgentOptions<Id, InputSchema, OutputSchema, Tools>) {
    if (!(yield* isRecordEffect(options))) {
      return yield* Effect.fail(
        agentDefinitionFailure(new TypeError("Agent options must be an object")),
      );
    }
    if (Object.hasOwn(options, "handler")) {
      return yield* Effect.fail(
        agentDefinitionFailure(new TypeError("Agents cannot own handlers")),
      );
    }
    const assemble = yield* Effect.try({
      try: () => prepareAgentDescriptor(options),
      catch: agentDefinitionFailure,
    });
    const id =
      options.id === undefined
        ? yield* createUnboundIdentityEffect().pipe(
            Effect.mapError((error) => agentDefinitionFailure(error.cause)),
          )
        : options.id;
    return yield* Effect.try({ try: () => assemble(id as Id), catch: agentDefinitionFailure });
  },
  (effect) => observeAgent("definition.define", effect),
);

/** Defines an SDK-independent agent using validated schemas and RELKIT tool references.
 * @typeParam Id - Explicit or source-inferred agent identity.
 * @typeParam InputSchema - Runtime input validator.
 * @typeParam OutputSchema - Runtime output validator.
 * @typeParam Tools - Authored tool tuple retained in the descriptor.
 * @param options - Generic authoring inputs; native APIs use @relkit/langchain.
 * @returns Frozen metadata consumed by compilation and selected execution.
 * @throws The original authoring validation or identity error.
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
  const Tools extends readonly ToolRefAny[],
>(
  options: DefineAgentOptions<Id, InputSchema, OutputSchema, Tools>,
): AgentDescriptor<
  Id,
  InferInput<InputSchema>,
  InferOutput<OutputSchema>,
  InputSchema,
  OutputSchema,
  Tools
> {
  return Effect.runSync(
    defineAgentEffect(options).pipe(
      Effect.catchTag("AgentDefinitionFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}
