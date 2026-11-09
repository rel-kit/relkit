/** Exposes the LangChain-native descriptor types and validators; agents are defined with
 * `defineAgent` from `relkit` and `runtime: langchain({ ... })`. */

export { assertAgentDescriptor, isAgentDescriptor } from "./define-agent-validation.js";
export { copyAgentLimits, copyAgentLimitsEffect } from "relkit/agents/define-agent-limits";
export type {
  AgentClientStateKey,
  AgentMiddleware,
  AgentMiddlewareState,
  AgentModel,
  AgentModelFactory,
  AgentTool,
  NativeAgentTool,
} from "./define-agent-native.types.js";
export type { AgentChatMapping, AgentClientPolicy, AgentControl } from "relkit/agents/agent-client";
export type {
  AgentFilesystemBackend,
  AgentSubagent,
  DeepAgentCapabilities,
} from "./define-agent-deep.types.js";
export type {
  AgentDescriptor,
  AgentInstructions,
  AgentLimits,
  DefineAgentOptions,
  PromptInstructions,
  PromptTemplate,
} from "./define-agent.types.js";
