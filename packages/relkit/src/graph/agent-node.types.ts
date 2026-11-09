/** Defines serialized agent graph metadata and the explicit marker for selected DeepAgents execution. */
import type { JsonValue } from "../contracts/index.js";
import type { AgentClientContractMetadata } from "./agent-client-contract.types.js";
import type { GeneratedAgentMarker } from "./foundation-nodes.types.js";
import type { GraphNodeBase } from "./model.js";

/**
 * Agent execution contract including tools, resources, and generated function identity.
 * @remarks The compiler records this as serializable graph data.
 * @example const inspect = (value: AgentNode): void => { console.log(value); };
 */
export interface AgentNode extends GraphNodeBase<"agent"> {
  readonly input: JsonValue;
  readonly output: JsonValue;
  readonly model?: string;
  readonly modelSource?: "native";
  readonly instructions: JsonValue;
  readonly toolIds: readonly string[];
  readonly limits: JsonValue;
  readonly generatedFunction: GeneratedAgentMarker;
  readonly profile: string;
  readonly stateProfile?: string;
  readonly client?: "public" | "protected";
  readonly chat?: JsonValue;
  readonly controls?: JsonValue;
  readonly execution?: "graph";
  /** Adapter that executes the agent; graph workflows have none and run on LangChain. */
  readonly runtime?: AgentRuntimeNode;
  /** Native DeepAgents-only capabilities selected by the authored descriptor. */
  readonly requiresDeepAgents?: true;
  readonly workflow?: JsonValue;
  readonly workflowTopology?: AgentWorkflowTopology;
  readonly subagents?: readonly AgentSubagentTopology[];
  readonly resourceDependencies?: readonly AgentResourceDependency[];
  readonly backendBucketId?: string;
  readonly clientContract?: AgentClientContractMetadata;
}

/**
 * Adapter identity recorded for an agent; it selects the adapter's `agent-execution` registration.
 * @example const runtime: AgentRuntimeNode = { integrationId: "langchain", adapterId: "langchain", protocolVersion: 1, nativeOptions: [] };
 */
export interface AgentRuntimeNode {
  readonly integrationId: string;
  readonly adapterId: string;
  readonly protocolVersion: 1;
  readonly nativeOptions: readonly string[];
}

/**
 * Static topology of a compiled agent workflow.
 * @remarks The compiler records this as serializable graph data.
 * @example const inspect = (value: AgentWorkflowTopology): void => { console.log(value); };
 */
export interface AgentWorkflowTopology {
  readonly start: string;
  readonly end: string;
  readonly registeredNodes: readonly string[];
  readonly conditionalRoutes: readonly {
    readonly from: string;
    readonly routes: readonly { readonly label: string; readonly to: string }[];
  }[];
  readonly dynamicRoutes: readonly string[];
  readonly parallelBranches: readonly { readonly from: string; readonly to: readonly string[] }[];
  readonly joins: readonly { readonly from: readonly string[]; readonly to: string }[];
  readonly loops: readonly { readonly from: string; readonly to: string }[];
  readonly subgraphs: readonly string[];
}

/**
 * Recursive subagent membership projected into the graph.
 * @remarks The compiler records this as serializable graph data.
 * @example const inspect = (value: AgentSubagentTopology): void => { console.log(value); };
 */
export interface AgentSubagentTopology {
  readonly id: string;
  readonly subagents: readonly AgentSubagentTopology[];
}

/**
 * External resource required by an agent.
 * @remarks The compiler records this as serializable graph data.
 * @example const inspect = (value: AgentResourceDependency): void => { console.log(value); };
 */
export interface AgentResourceDependency {
  readonly kind:
    "model" | "agent-state" | "bucket" | "checkpointer" | "memory" | "skills" | "memory-files";
  readonly id?: string;
  readonly profile?: string;
  readonly ownership?: "owned" | "borrowed";
  readonly count?: number;
}
