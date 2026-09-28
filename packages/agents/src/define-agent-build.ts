import { createDescriptorBase, normalizeId } from "@relkit/contracts";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import { copyAgentInstructions } from "./define-agent-support.js";
import { agentClientContractMetadata } from "./client-contract-metadata.js";
import { assertAgentSchema } from "./agent-validation.js";
import { copyAgentChat, copyAgentClientPolicy, copyAgentControls } from "./agent-client.js";
import {
  copyAgentMiddleware,
  copyAgentTools,
  middlewareStateKeys,
  type AgentMiddleware,
  type AgentTool,
} from "./define-agent-native.js";
import { normalizeAgentModel } from "./define-agent-validation.js";
import { copyDeepAgentCapabilities } from "./define-agent-deep.js";
import { copyAgentLimits } from "./define-agent-limits.js";
import type { AgentDescriptor, DefineAgentOptions } from "./define-agent.types.js";

/** Validates agent options and returns an assembler for a resolved identity.
 * @param options - Validated authoring options.
 * @returns A function that assembles a frozen descriptor from its identity.
 * @throws Validation errors from fields and client policy.
 * @example prepareAgentDescriptor(options)("support");
 */
export function prepareAgentDescriptor<
  const Id extends string,
  const InputSchema extends StandardSchemaV1,
  const OutputSchema extends StandardSchemaV1,
  const Middleware extends readonly AgentMiddleware[],
  const Tools extends readonly AgentTool[],
>(
  options: DefineAgentOptions<Id, InputSchema, OutputSchema, Middleware, Tools>,
): (
  id: Id,
) => AgentDescriptor<
  Id,
  InferInput<InputSchema>,
  InferOutput<OutputSchema>,
  InputSchema,
  OutputSchema,
  Middleware,
  Tools
> {
  assertAgentSchema(options.input, "input");
  assertAgentSchema(options.output, "output");
  const model = normalizeAgentModel(options.model);
  const instructions = copyAgentInstructions(options.instructions);
  const tools = copyAgentTools(options.tools);
  const middleware = copyAgentMiddleware(options.middleware);
  const limits = copyAgentLimits(options.limits);
  const client = copyAgentClientPolicy(options.client, middlewareStateKeys(middleware));
  const controls = copyAgentControls(options.controls);
  const chat = copyAgentChat(options.chat);
  const deep = copyDeepAgentCapabilities(options);
  if (client !== undefined && options.stateProfile === undefined) {
    throw new TypeError("Client-exposed agents require stateProfile");
  }
  const stateProfile =
    options.stateProfile === undefined ? undefined : normalizeId(options.stateProfile);
  return (id: Id) => {
    const base = createDescriptorBase("agent", id, options);
    const clientContract = agentClientContractMetadata({
      id,
      tools: options.tools,
      middleware,
      ...(client === undefined ? {} : { client }),
      ...deep,
    });

    return Object.freeze({
      ...base,
      input: options.input,
      output: options.output,
      ...(model === undefined ? {} : { model }),
      instructions,
      tools,
      middleware,
      limits,
      ...(stateProfile === undefined ? {} : { stateProfile }),
      ...(client === undefined ? {} : { client }),
      ...(chat === undefined ? {} : { chat }),
      ...(controls === undefined ? {} : { controls }),
      clientContract,
      ...deep,
    }) as AgentDescriptor<
      Id,
      InferInput<InputSchema>,
      InferOutput<OutputSchema>,
      InputSchema,
      OutputSchema,
      Middleware,
      Tools
    >;
  };
}
