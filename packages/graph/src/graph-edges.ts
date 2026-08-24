import type { ServiceMemberEdge, ServiceMiddlewareEdge } from "./service-nodes.js";

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
  "contains-function",
  "uses-service-middleware",
  "uses-middleware",
  "uses-hook",
] as const;
export type GraphEdgeKind = (typeof GRAPH_EDGE_KINDS)[number];
export interface GraphEdgeBase<Kind extends GraphEdgeKind = GraphEdgeKind> {
  readonly kind: Kind;
  readonly from: string;
  readonly to: string;
}
export interface TargetsFunctionEdge extends GraphEdgeBase<"targets-function"> {
  readonly role: "primary";
}
export interface UsesMiddlewareEdge extends GraphEdgeBase<"uses-middleware"> {
  readonly order: number;
  readonly match: "always" | "conditional";
}
export interface UsesHookEdge extends GraphEdgeBase<"uses-hook"> {
  readonly phase: "before" | "after";
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
  | GraphEdgeBase<"uses-provider-profile">
  | ServiceMemberEdge
  | ServiceMiddlewareEdge
  | UsesMiddlewareEdge
  | UsesHookEdge;

export function isGraphEdgeKind(value: unknown): value is GraphEdgeKind {
  return typeof value === "string" && (GRAPH_EDGE_KINDS as readonly string[]).includes(value);
}
