/**
 * Validates portable authoring inputs before binding a descriptor identity, then lets the selected
 * adapter add its own fields. Native fields outside the adapter's options are rejected.
 */
import { createDescriptorBase, normalizeId } from "../contracts/index.js";
import type { StandardSchemaV1 } from "../schema/index.js";
import { isToolRef, type ToolRefAny } from "../tools/index.js";
import { copyAgentInstructions } from "./define-agent-support.js";
import { agentClientContractMetadata } from "./client-contract-metadata.js";
import { assertAgentSchema } from "./agent-validation.js";
import { copyAgentChat, copyAgentClientPolicy, copyAgentControls } from "./agent-client.js";
import { normalizeModelSelector } from "./model-selection.js";
import { copyAgentLimits } from "./define-agent-limits.js";
import { agentRuntimeReference, isAgentRuntimeAdapter } from "../agent-adapters/index.js";
import type { AgentRuntimeAdapterAny } from "../agent-adapters/index.js";
import type {
  AgentDefinition,
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
  const Runtime extends AgentRuntimeAdapterAny,
>(
  options: DefineAgentOptions<Id, InputSchema, OutputSchema, Tools, Runtime>,
): (id: Id) => AgentDefinition<Id, InputSchema, OutputSchema, Tools, Runtime> {
  const runtime: AgentRuntimeAdapterAny = options.runtime;
  if (!isAgentRuntimeAdapter(runtime)) {
    throw new TypeError(
      "Agents require a runtime adapter, such as runtime: langchain() from @relkit/langchain",
    );
  }
  assertGenericCapabilities(options);
  if (options.model !== undefined && typeof options.model !== "string") {
    throw new TypeError(
      "Agent model names a model profile; pass native models through the adapter's options",
    );
  }
  assertAgentSchema(options.input, "input");
  assertAgentSchema(options.output, "output");
  const model = normalizeModelSelector(options.model);
  const instructions = copyAgentInstructions(options.instructions);
  const tools = copyTools(options.tools);
  const limits = copyAgentLimits(options.limits);
  const client = copyAgentClientPolicy(options.client, new Set(runtime.clientStateKeys));
  const controls = copyAgentControls(options.controls);
  const chat = copyAgentChat(options.chat);
  if (client !== undefined && options.stateProfile === undefined) {
    throw new TypeError("Client-exposed agents require stateProfile");
  }
  const stateProfile =
    options.stateProfile === undefined ? undefined : normalizeId(options.stateProfile);
  const { runtime: _runtime, ...authored } = options;
  return (id: Id) => {
    const descriptor = {
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
    };
    const native = runtime.extend?.({ id, options: authored, descriptor }) ?? {};
    return Object.freeze({
      ...descriptor,
      ...native,
      runtime: agentRuntimeReference(runtime),
    }) as unknown as AgentDefinition<Id, InputSchema, OutputSchema, Tools, Runtime>;
  };
}

/** Rejects native options at the generic facade instead of silently dropping them.
 * @param options - Generic options whose runtime input may contain additional keys.
 * @returns Nothing when native capabilities are absent.
 */
function assertGenericCapabilities(options: object): void {
  for (const key of [
    "middleware",
    "subagents",
    "skills",
    "memory",
    "backend",
    "checkpointer",
    "store",
    "interruptOn",
  ]) {
    if (Object.hasOwn(options, key))
      throw new TypeError(
        `Agent ${key} is an adapter option; pass it through the runtime adapter, such as langchain({ ${key} })`,
      );
  }
}

/** Copies a validated RelKit tool tuple without converting native tools.
 * @param tools - Authored references whose order and literal identities must be retained.
 * @returns Frozen tool tuple.
 */
function copyTools<const Tools extends readonly ToolRefAny[]>(
  tools: Tools,
): AgentToolReferences<Tools> {
  if (!Array.isArray(tools) || tools.some((tool) => !isToolRef(tool))) {
    throw new TypeError(
      "Agent tools must be RelKit tool references; pass native tools through the adapter's options",
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
