import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import type { InterruptOnConfig } from "langchain";
import type { CheckpointerResource, MemoryResource } from "./define-persistence.js";
import type { AgentDescriptor } from "./define-agent.js";

/** Agent descriptor nested under a DeepAgent. */
export type AgentSubagent = AgentDescriptor<string, unknown, unknown>;

/** DeepAgents filesystem backend or a state-bound backend factory. */
export type AgentFilesystemBackend =
  object | ((context: { readonly state: unknown; readonly store?: unknown }) => object);

/** Optional capabilities enabled for a DeepAgent. */
export interface DeepAgentCapabilities {
  readonly subagents?: readonly AgentSubagent[];
  readonly skills?: readonly string[];
  readonly memory?: readonly string[];
  readonly backend?: AgentFilesystemBackend;
  readonly checkpointer?: BaseCheckpointSaver | CheckpointerResource;
  readonly store?: BaseStore | MemoryResource;
  readonly interruptOn?: Readonly<Record<string, boolean | InterruptOnConfig>>;
}
