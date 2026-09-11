import { createDescriptorBase, normalizeId } from "@relkit/contracts";
import { createUnboundIdentity } from "@relkit/invocation";
import { type InferInput, type InferOutput, type StandardSchemaV1 } from "@relkit/schema";
import { copyAgentInstructions } from "./define-agent-support.js";
import { agentClientContractMetadata } from "./client-contract-metadata.js";
import { assertAgentSchema, isRecord, positiveInteger } from "./agent-validation.js";
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
import type { AgentDescriptor, AgentLimits, DefineAgentOptions } from "./define-agent-types.js";

export { assertAgentDescriptor, isAgentDescriptor } from "./define-agent-validation.js";

export type {
  AgentClientStateKey,
  AgentMiddleware,
  AgentMiddlewareState,
  AgentModel,
  AgentModelFactory,
  AgentTool,
  NativeAgentTool,
} from "./define-agent-native.js";

export type { AgentChatMapping, AgentClientPolicy, AgentControl } from "./agent-client.js";
export type {
  AgentFilesystemBackend,
  AgentSubagent,
  DeepAgentCapabilities,
} from "./define-agent-deep.js";
export type {
  AgentDescriptor,
  AgentInstructions,
  AgentLimits,
  DefineAgentOptions,
  PromptInstructions,
  PromptTemplate,
} from "./define-agent-types.js";

/**
 * Defines a bounded native LangChain agent contract with validated tools, middleware, and client state.
 *
 * @example
 * ```ts
 * import { defineAgent } from "@relkit/app/agents"
 * import { z } from "@relkit/app/schema"
 *
 * const support = defineAgent({
 *   id: "support",
 *   input: z.object({ message: z.string() }),
 *   output: z.object({ answer: z.string() }),
 *   instructions: "Reply briefly.",
 *   tools: [],
 *   limits: { maxSteps: 4, maxToolCalls: 2, timeoutMs: 30_000 },
 * })
 * void support
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
  if (!isRecord(options)) throw new TypeError("Agent options must be an object");
  if (Object.hasOwn(options, "handler")) throw new TypeError("Agents cannot own handlers");
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
  const id = (options.id === undefined ? createUnboundIdentity() : options.id) as Id;
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
}

export function copyAgentLimits(value: unknown): AgentLimits {
  if (!isRecord(value)) throw new TypeError("Agent limits must be an object");
  return Object.freeze({
    maxSteps: positiveInteger(value.maxSteps, "limits.maxSteps"),
    maxToolCalls: positiveInteger(value.maxToolCalls, "limits.maxToolCalls"),
    timeoutMs: positiveInteger(value.timeoutMs, "limits.timeoutMs"),
  });
}
