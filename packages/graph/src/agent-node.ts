import type { JsonValue } from "@relkit/contracts";
import type { AgentClientContractMetadata } from "./agent-client-contract.js";
import type { GeneratedAgentMarker } from "./foundation-nodes.js";
import type { GraphNodeBase } from "./model.js";

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
  readonly workflow?: JsonValue;
  readonly workflowTopology?: AgentWorkflowTopology;
  readonly subagents?: readonly AgentSubagentTopology[];
  readonly resourceDependencies?: readonly AgentResourceDependency[];
  readonly backendBucketId?: string;
  readonly clientContract?: AgentClientContractMetadata;
}

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

export interface AgentSubagentTopology {
  readonly id: string;
  readonly subagents: readonly AgentSubagentTopology[];
}

export interface AgentResourceDependency {
  readonly kind:
    "model" | "agent-state" | "bucket" | "checkpointer" | "memory" | "skills" | "memory-files";
  readonly id?: string;
  readonly profile?: string;
  readonly ownership?: "owned" | "borrowed";
  readonly count?: number;
}
