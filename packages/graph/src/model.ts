import type { JsonValue, SourceLocation } from "@zsys/contracts";
import type {
  AppNode,
  EnvironmentVariableNode,
  GeneratedAgentMarker,
  GeneratedFunctionMarker,
} from "./foundation-nodes.js";
import type { ServiceNode } from "./service-nodes.js";

export const GRAPH_NODE_KINDS = [
  "app",
  "env",
  "function",
  "trigger",
  "job",
  "event",
  "bucket",
  "cache",
  "tool",
  "agent",
  "provider",
  "service",
  "middleware",
  "hook",
] as const;
export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];
export type GraphTriggerType = "http" | "queue" | "schedule" | "event";
export interface GraphNodeBase<Kind extends GraphNodeKind = GraphNodeKind> {
  readonly kind: Kind;
  readonly id: string;
  readonly source: SourceLocation;
}
export interface FunctionNode extends GraphNodeBase<"function"> {
  readonly input: JsonValue;
  readonly output: JsonValue;
  readonly errors?: JsonValue;
  readonly dependencies?: JsonValue;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly generated?: GeneratedFunctionMarker;
}
export type { AppNode, EnvironmentVariableNode } from "./foundation-nodes.js";
export interface MiddlewareRouteRef {
  readonly id: string;
  readonly path: string;
  readonly order: number;
  readonly match: "always" | "conditional";
}
export interface TransformProjection {
  readonly id: string;
  readonly schema: JsonValue;
}
export interface HttpTriggerConfig {
  readonly method: string;
  readonly path: string;
  readonly rawHandler?: boolean;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly runtimePaths?: readonly string[];
  readonly request: JsonValue;
  readonly responses: JsonValue;
  readonly middleware: readonly MiddlewareRouteRef[];
  readonly transforms: readonly TransformProjection[];
  readonly rateLimit?: {
    readonly limit: number;
    readonly windowMs: number;
    readonly key: JsonValue;
    readonly storeId?: string;
  };
  readonly maxBodyBytes?: number;
  readonly timeoutMs?: number;
}
export type SelectorExpansion = `${string}@${number}`;
export interface EventTriggerConfig {
  readonly selector: JsonValue;
  readonly expansion: readonly SelectorExpansion[];
  readonly delivery: "ephemeral" | "durable";
  readonly profile?: string;
  readonly retry?: JsonValue;
  readonly concurrency?: number;
}
export interface TriggerNode<
  Trigger extends GraphTriggerType = GraphTriggerType,
  Config = JsonValue,
> extends GraphNodeBase<"trigger"> {
  readonly triggerType: Trigger;
  readonly targetFunctionId: string;
  readonly config: Config;
}
export interface JobNode extends GraphNodeBase<"job"> {
  readonly input: JsonValue;
  readonly targetFunctionId: string;
  readonly profile: string;
  readonly retry?: JsonValue;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly schedule?: JsonValue;
  readonly idempotency?: JsonValue;
}
export interface EventNode extends GraphNodeBase<"event"> {
  readonly version: number;
  readonly payload: JsonValue;
  readonly sensitiveFields?: readonly string[];
  readonly profile: string;
}
export interface BucketNode extends GraphNodeBase<"bucket"> {
  readonly profile: string;
  readonly visibility: "private" | "public";
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}
export interface CacheNode extends GraphNodeBase<"cache"> {
  readonly key: JsonValue;
  readonly value: JsonValue;
  readonly profile: string;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
}
export interface ToolNode extends GraphNodeBase<"tool"> {
  readonly targetFunctionId: string;
  readonly description: string;
  readonly sideEffect: "none" | "read" | "write" | "external";
  readonly approval: "never" | "on-write" | "always";
  readonly timeoutMs?: number;
  readonly mcp: boolean;
}
export interface MiddlewareNode extends GraphNodeBase<"middleware"> {
  readonly path: string;
  readonly order: number;
}
export interface HookNode extends GraphNodeBase<"hook"> {
  readonly ownerId: string;
  readonly ownerKind: "function" | "tool";
  readonly phase: "before" | "after";
}
export interface AgentNode extends GraphNodeBase<"agent"> {
  readonly input: JsonValue;
  readonly output: JsonValue;
  readonly model?: string;
  readonly instructions: JsonValue;
  readonly toolIds: readonly string[];
  readonly limits: JsonValue;
  readonly generatedFunction: GeneratedAgentMarker;
  readonly profile: string;
}
export interface ProviderProfileNode extends GraphNodeBase<"provider"> {
  readonly profile: string;
  readonly capability: string;
  readonly adapter: string;
  readonly ownership: "external" | "managed";
  readonly configuration: JsonValue;
  readonly environment: readonly {
    readonly name: string;
    readonly type: string;
    readonly sensitive: boolean;
  }[];
}
export type GraphNode =
  | AppNode
  | EnvironmentVariableNode
  | FunctionNode
  | TriggerNode
  | JobNode
  | EventNode
  | BucketNode
  | CacheNode
  | ToolNode
  | AgentNode
  | ProviderProfileNode
  | ServiceNode
  | MiddlewareNode
  | HookNode;
export {
  GRAPH_EDGE_KINDS,
  isGraphEdgeKind,
  type GraphEdge,
  type GraphEdgeBase,
  type GraphEdgeKind,
  type TargetsFunctionEdge,
  type UsesHookEdge,
  type UsesMiddlewareEdge,
} from "./graph-edges.js";
export type TargetFunctionRole = "primary";
export type { ApplicationGraph, Graph, ObservedEdge } from "./graph-types.js";
export function isGraphNodeKind(value: unknown): value is GraphNodeKind {
  return typeof value === "string" && (GRAPH_NODE_KINDS as readonly string[]).includes(value);
}
