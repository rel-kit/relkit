import type {
  ExposesEventEdge,
  ExposesFunctionEdge,
  ExposesJobEdge,
  ExposesTaskEdge,
} from "./service-nodes.types.js";
import type { GRAPH_EDGE_KINDS } from "./graph-edges.js";

/** Stable kind of a declared graph edge.
 * @example const kind: GraphEdgeKind = "calls-function";
 */
export type GraphEdgeKind = (typeof GRAPH_EDGE_KINDS)[number];

/** Shared source and target identity for a declared edge.
 * @example const edge: GraphEdgeBase<"calls-function"> = { kind: "calls-function", from: "a", to: "b" };
 */
export interface GraphEdgeBase<Kind extends GraphEdgeKind = GraphEdgeKind> {
  readonly kind: Kind;
  readonly from: string;
  readonly to: string;
}

/** Primary route-to-function edge.
 * @example const edge: TargetsFunctionEdge = { kind: "targets-function", from: "route", to: "fn", role: "primary" };
 */
export interface TargetsFunctionEdge extends GraphEdgeBase<"targets-function"> {
  readonly role: "primary";
}

/** Primary trigger-to-task edge.
 * @example const edge: TargetsTaskEdge = { kind: "targets-task", from: "trigger", to: "task", role: "primary" };
 */
export interface TargetsTaskEdge extends GraphEdgeBase<"targets-task"> {
  readonly role: "primary";
}

/** Ordered middleware binding to a route.
 * @example const edge: UsesMiddlewareEdge = { kind: "uses-middleware", from: "route", to: "auth", order: 0, match: "always" };
 */
export interface UsesMiddlewareEdge extends GraphEdgeBase<"uses-middleware"> {
  readonly order: number;
  readonly match: "always" | "conditional";
}

/** Hook lifecycle phase attached to an owner node.
 * @example const edge: UsesHookEdge = { kind: "uses-hook", from: "task", to: "hook", phase: "before" };
 */
export interface UsesHookEdge extends GraphEdgeBase<"uses-hook"> {
  readonly phase: "before" | "after" | "start" | "success" | "failure";
}

/** All supported declared graph edge shapes.
 * @example const edge: GraphEdge = { kind: "calls-function", from: "a", to: "b" };
 */
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
