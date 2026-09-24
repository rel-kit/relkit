import type { JsonValue, SourceLocation } from "@relkit/contracts";
import type { AppNode, EnvironmentVariableNode } from "./foundation-nodes.types.js";
import type { DomainExposure, ErrorNode, FunctionNode } from "./domain-nodes.types.js";
import type { ProviderBindingNode } from "./provider-nodes.js";
import type { ServiceNode } from "./service-nodes.types.js";
import type { AgentNode } from "./agent-node.types.js";
import type { HookNode, JobNode, TaskNode } from "./task-nodes.types.js";
import type { GRAPH_NODE_KINDS } from "./model.js";
import type { TriggerNode } from "./trigger-nodes.types.js";
export type {
  FunctionHookNode,
  HookNode,
  JobNode,
  LegacyJobNode,
  TaskHookNode,
  TaskJobNode,
  TaskNode,
} from "./task-nodes.types.js";
export type {
  AgentNode,
  AgentResourceDependency,
  AgentSubagentTopology,
  AgentWorkflowTopology,
} from "./agent-node.types.js";
/** Supported graph node kind.
 * @example function inspect(value: GraphNodeKind): void { console.log(value); }
 */
export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];
/** Trigger transport represented by a graph trigger node.
 * @example function inspect(value: GraphTriggerType): void { console.log(value); }
 */
export type GraphTriggerType = "http" | "queue" | "schedule" | "event";
/** Shared identity and source fields on every graph node.
 * @example function inspect(value: GraphNodeBase<"app">): void { console.log(value); }
 */
export interface GraphNodeBase<Kind extends GraphNodeKind = GraphNodeKind> {
  readonly kind: Kind;
  readonly id: string;
  readonly source: SourceLocation;
  readonly domainId?: string;
}
export type { DomainExposure, ErrorNode, FunctionNode } from "./domain-nodes.types.js";
export type { AppNode, EnvironmentVariableNode } from "./foundation-nodes.types.js";
/** Published event contract and exposure metadata.
 * @example function inspect(value: EventNode): void { console.log(value); }
 */
export interface EventNode extends GraphNodeBase<"event"> {
  readonly exposure?: DomainExposure;
  readonly version: number;
  readonly input: JsonValue;
  readonly sensitiveFields?: readonly string[];
  readonly profile: string;
}
/** Object bucket contract and visibility policy.
 * @example function inspect(value: BucketNode): void { console.log(value); }
 */
export interface BucketNode extends GraphNodeBase<"bucket"> {
  readonly profile: string;
  readonly visibility: "private" | "public";
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}
/** Cache key, value, and retention contract.
 * @example function inspect(value: CacheNode): void { console.log(value); }
 */
export interface CacheNode extends GraphNodeBase<"cache"> {
  readonly key: JsonValue;
  readonly value: JsonValue;
  readonly profile: string;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
}
/** Callable tool contract and approval policy.
 * @example function inspect(value: ToolNode): void { console.log(value); }
 */
export interface ToolNode extends GraphNodeBase<"tool"> {
  readonly targetFunctionId: string;
  readonly description: string;
  readonly sideEffect: "none" | "read" | "write" | "external";
  readonly approval: "never" | "on-write" | "always";
  readonly timeoutMs?: number;
  readonly mcp: boolean;
}
/** Middleware source and registration order.
 * @example function inspect(value: MiddlewareNode): void { console.log(value); }
 */
export interface MiddlewareNode extends GraphNodeBase<"middleware"> {
  readonly path: string;
  readonly order: number;
}
/** Realtime channel contract and access policy.
 * @example function inspect(value: ChannelNode): void { console.log(value); }
 */
export interface ChannelNode extends GraphNodeBase<"channel"> {
  readonly params: JsonValue;
  readonly events: Readonly<Record<string, JsonValue>>;
  readonly profile: string;
  readonly client: "internal" | "public" | "protected";
  readonly replay?: JsonValue;
  readonly presence?: JsonValue;
}
/** Union of all supported graph node shapes.
 * @example function inspect(value: GraphNode): void { console.log(value); }
 */
export type GraphNode =
  | AppNode
  | EnvironmentVariableNode
  | FunctionNode
  | TaskNode
  | ErrorNode
  | TriggerNode
  | JobNode
  | EventNode
  | BucketNode
  | CacheNode
  | ToolNode
  | AgentNode
  | ChannelNode
  | ProviderBindingNode
  | ServiceNode
  | MiddlewareNode
  | HookNode;
/** Primary role for function target edges.
 * @example function inspect(value: TargetFunctionRole): void { console.log(value); }
 */
export type TargetFunctionRole = "primary";
export type { ApplicationGraph, Graph, ObservedEdge } from "./graph-types.types.js";
export type {
  MiddlewareRouteRef,
  TransformProjection,
  HttpTriggerConfig,
  EventTriggerConfig,
  TriggerNode,
} from "./trigger-nodes.types.js";
export type {
  GraphEdge,
  GraphEdgeBase,
  GraphEdgeKind,
  TargetsTaskEdge,
  TargetsFunctionEdge,
  UsesHookEdge,
  UsesMiddlewareEdge,
} from "./graph-edges.js";
