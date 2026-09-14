import type {
  ExposesEventEdge,
  ExposesFunctionEdge,
  ExposesJobEdge,
  ExposesTaskEdge,
} from "./service-nodes.js";

export const GRAPH_EDGE_KINDS = [
  "targets-function",
  "targets-task",
  "calls-function",
  "enqueues-job",
  "triggers-job",
  "triggers-task",
  "publishes-event",
  "listens-to-event",
  "uses-bucket",
  "uses-cache",
  "invokes-agent",
  "exposes-as-tool",
  "uses-tool",
  "uses-provider-profile",
  "exposes-function",
  "exposes-event",
  "exposes-task",
  "exposes-job",
  "depends-on-service",
  "mounts-service",
  "declares-error",
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
export interface TargetsTaskEdge extends GraphEdgeBase<"targets-task"> {
  readonly role: "primary";
}
export interface UsesMiddlewareEdge extends GraphEdgeBase<"uses-middleware"> {
  readonly order: number;
  readonly match: "always" | "conditional";
}
export interface UsesHookEdge extends GraphEdgeBase<"uses-hook"> {
  readonly phase: "before" | "after" | "start" | "success" | "failure";
}
export type GraphEdge =
  | TargetsFunctionEdge
  | TargetsTaskEdge
  | GraphEdgeBase<"calls-function">
  | GraphEdgeBase<"enqueues-job">
  | GraphEdgeBase<"triggers-job">
  | GraphEdgeBase<"triggers-task">
  | GraphEdgeBase<"publishes-event">
  | GraphEdgeBase<"listens-to-event">
  | GraphEdgeBase<"uses-bucket">
  | GraphEdgeBase<"uses-cache">
  | GraphEdgeBase<"invokes-agent">
  | GraphEdgeBase<"exposes-as-tool">
  | GraphEdgeBase<"uses-tool">
  | GraphEdgeBase<"uses-provider-profile">
  | ExposesFunctionEdge
  | ExposesEventEdge
  | ExposesTaskEdge
  | ExposesJobEdge
  | GraphEdgeBase<"depends-on-service">
  | GraphEdgeBase<"mounts-service">
  | GraphEdgeBase<"declares-error">
  | UsesMiddlewareEdge
  | UsesHookEdge;

export function isGraphEdgeKind(value: unknown): value is GraphEdgeKind {
  return typeof value === "string" && (GRAPH_EDGE_KINDS as readonly string[]).includes(value);
}
