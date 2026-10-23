/**
 * Validates generic authoring inputs before binding a descriptor identity.
 * Native fields are rejected with their integration import so no capability is silently ignored.
 */
import { createDescriptorBase, normalizeId } from "@relkit/contracts";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import { isToolRef, type ToolRefAny } from "@relkit/tools";
import { copyAgentInstructions } from "./define-agent-support.js";
import { agentClientContractMetadata } from "./client-contract-metadata.js";
import { assertAgentSchema } from "./agent-validation.js";
import { copyAgentChat, copyAgentClientPolicy, copyAgentControls } from "./agent-client.js";
import { normalizeModelSelector } from "./model-selection.js";
import { copyAgentLimits } from "./define-agent-limits.js";
import type {
  AgentDescriptor,
  AgentToolReferences,
  DefineAgentOptions,
} from "./define-agent.types.js";

/** Prepares immutable generic metadata before applying its stable identity.
 * @param options - Typed generic agent options.
 * @returns An assembler preserving the authored schema and tool tuple types.
 * @throws TypeError for unsupported native fields or invalid generic inputs.
 */
export function prepareAgentDescriptor<
  const Id extends string,
  const InputSchema extends StandardSchemaV1,
  const OutputSchema extends StandardSchemaV1,
  const Tools extends readonly ToolRefAny[],
>(
  options: DefineAgentOptions<Id, InputSchema, OutputSchema, Tools>,
): (
  id: Id,
) => AgentDescriptor<
  Id,
  InferInput<InputSchema>,
  InferOutput<OutputSchema>,
  InputSchema,
  OutputSchema,
  Tools
> {
  assertGenericCapabilities(options);
  if (options.model !== undefined && typeof options.model !== "string") {
    throw new TypeError("Native models require defineAgent from @relkit/langchain");
  }
  assertAgentSchema(options.input, "input");
  assertAgentSchema(options.output, "output");
  const model = normalizeModelSelector(options.model);
  const instructions = copyAgentInstructions(options.instructions);
  const tools = copyTools(options.tools);
  const limits = copyAgentLimits(options.limits);
  const client = copyAgentClientPolicy<never>(options.client);
  const controls = copyAgentControls(options.controls);
  const chat = copyAgentChat(options.chat);
  if (client !== undefined && options.stateProfile === undefined) {
    throw new TypeError("Client-exposed agents require stateProfile");
  }
  const stateProfile =
    options.stateProfile === undefined ? undefined : normalizeId(options.stateProfile);
  return (id: Id) =>
    Object.freeze({
      ...createDescriptorBase("agent", id, options),
      input: options.input,
      output: options.output,
      ...(model === undefined ? {} : { model }),
      instructions,
      tools,
      middleware: Object.freeze([] as const),
      limits,
      ...(stateProfile === undefined ? {} : { stateProfile }),
      ...(client === undefined ? {} : { client }),
      ...(chat === undefined ? {} : { chat }),
      ...(controls === undefined ? {} : { controls }),
      clientContract: agentClientContractMetadata({
        id,
        tools,
        ...(client === undefined ? {} : { client }),
      }),
    });
}

/** Rejects native options at the generic facade instead of silently dropping them.
 * @param options - Generic options whose runtime input may contain additional keys.
 * @returns Nothing when native capabilities are absent.
 */
function assertGenericCapabilities(options: { readonly middleware?: readonly [] }): void {
  for (const key of [
    "subagents",
    "skills",
    "memory",
    "backend",
    "checkpointer",
    "store",
    "interruptOn",
  ]) {
    if (Object.hasOwn(options, key))
      throw new TypeError(`Agent ${key} requires defineAgent from @relkit/langchain`);
  }
  if (options.middleware !== undefined && options.middleware.length !== 0) {
    throw new TypeError("Native middleware requires defineAgent from @relkit/langchain");
  }
}

/** Copies a validated RELKIT tool tuple without converting native tools.
 * @param tools - Authored references whose order and literal identities must be retained.
 * @returns Frozen tool tuple.
 */
function copyTools<const Tools extends readonly ToolRefAny[]>(
  tools: Tools,
): AgentToolReferences<Tools> {
  if (!Array.isArray(tools) || tools.some((tool) => !isToolRef(tool))) {
    throw new TypeError(
      "Generic agent tools must be RELKIT references; native tools use @relkit/langchain",
    );
  }
  const ids = tools.map((tool) => tool.ref.id);
  if (new Set(ids).size !== ids.length) throw new TypeError("Duplicate agent tools");
  return Object.freeze(
    tools.map(({ ref }) =>
      Object.freeze({ ref: Object.freeze({ kind: "tool" as const, id: ref.id }) }),
    ),
  ) as AgentToolReferences<Tools>;
}
