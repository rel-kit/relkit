import type { JsonValue, SourceLocation } from "@zsys/contracts";

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
] as const;
export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];
export type GraphTriggerType = "http" | "queue" | "schedule" | "event";
export interface GraphNodeBase<Kind extends GraphNodeKind = GraphNodeKind> {
  readonly kind: Kind;
  readonly id: string;
  readonly source: SourceLocation;
}
export interface AppNode extends GraphNodeBase<"app"> {
  readonly environment?: JsonValue;
  readonly providerProfiles?: readonly string[];
  readonly observability?: JsonValue;
  readonly defaults?: JsonValue;
}
export interface EnvironmentVariableNode extends GraphNodeBase<"env"> {
  readonly name: string;
  readonly type: string;
  readonly requiredIn: readonly string[];
  readonly hasDefault: boolean;
  readonly sensitive: boolean;
  readonly description?: string;
}
export interface GeneratedAgentMarker {
  readonly generated: true;
  readonly generatedBy: "agent";
  readonly agentId: string;
  readonly functionId: string;
}
export interface FunctionNode extends GraphNodeBase<"function"> {
  readonly input: JsonValue;
  readonly output: JsonValue;
  readonly errors?: JsonValue;
  readonly dependencies?: JsonValue;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly generated?: GeneratedAgentMarker;
}
export interface MiddlewareTargetRef {
  readonly id: string;
  readonly targetFunctionId: string;
}
export interface TransformProjection {
  readonly id: string;
  readonly schema: JsonValue;
}
export interface HttpTriggerConfig {
  readonly method: string;
  readonly path: string;
  readonly request: JsonValue;
  readonly responses: JsonValue;
  readonly middleware: readonly MiddlewareTargetRef[];
  readonly transforms: readonly TransformProjection[];
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
}
export interface AgentNode extends GraphNodeBase<"agent"> {
  readonly input: JsonValue;
  readonly output: JsonValue;
  readonly modelProfile: string;
  readonly instructions: JsonValue;
  readonly toolIds: readonly string[];
  readonly limits: JsonValue;
  readonly generatedFunction: GeneratedAgentMarker;
}
export interface ProviderProfileNode extends GraphNodeBase<"provider"> {
  readonly profile: string;
  readonly capabilities: readonly string[];
  readonly configuration: JsonValue;
  readonly environment: readonly string[];
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
  | ProviderProfileNode;
export const GRAPH_EDGE_KINDS = [
  "targets-function",
  "calls-function",
  "enqueues-job",
  "publishes-event",
  "listens-to-event",
  "uses-bucket",
  "uses-cache",
  "invokes-agent",
  "exposes-as-tool",
  "uses-tool",
  "uses-provider-profile",
] as const;
export type GraphEdgeKind = (typeof GRAPH_EDGE_KINDS)[number];
export type TargetFunctionRole = "primary" | "middleware";
export interface GraphEdgeBase<Kind extends GraphEdgeKind = GraphEdgeKind> {
  readonly kind: Kind;
  readonly from: string;
  readonly to: string;
}
export interface TargetsFunctionEdge extends GraphEdgeBase<"targets-function"> {
  readonly role: TargetFunctionRole;
}
export type GraphEdge =
  | TargetsFunctionEdge
  | GraphEdgeBase<"calls-function">
  | GraphEdgeBase<"enqueues-job">
  | GraphEdgeBase<"publishes-event">
  | GraphEdgeBase<"listens-to-event">
  | GraphEdgeBase<"uses-bucket">
  | GraphEdgeBase<"uses-cache">
  | GraphEdgeBase<"invokes-agent">
  | GraphEdgeBase<"exposes-as-tool">
  | GraphEdgeBase<"uses-tool">
  | GraphEdgeBase<"uses-provider-profile">;
export interface ObservedEdge {
  readonly relationship: GraphEdgeKind;
  readonly from: string;
  readonly to: string;
}
export interface ApplicationGraph {
  readonly contractVersion: number;
  readonly appId?: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}
export type Graph = ApplicationGraph;
export function isGraphNodeKind(value: unknown): value is GraphNodeKind {
  return typeof value === "string" && (GRAPH_NODE_KINDS as readonly string[]).includes(value);
}
export function isGraphEdgeKind(value: unknown): value is GraphEdgeKind {
  return typeof value === "string" && (GRAPH_EDGE_KINDS as readonly string[]).includes(value);
}
