import type { MaybePromise } from "@relkit/contracts";
import type { AGENT_OBSERVABILITY_PROTOCOL, AGENT_OBSERVABILITY_VERSION } from "./observability.js";

/** Relationships reported by an agent's runtime hooks.
 * @example const relationship: AgentEdgeRelationship = "uses-tool";
 */
export type AgentEdgeRelationship =
  | "targets-function"
  | "calls-function"
  | "enqueues-job"
  | "publishes-event"
  | "listens-to-event"
  | "uses-bucket"
  | "uses-cache"
  | "invokes-agent"
  | "exposes-as-tool"
  | "uses-tool"
  | "uses-provider-profile";

/** Directed relationship between two stable descriptors.
 * @example const edge: AgentObservedEdge = { relationship: "uses-tool", from: "agent", to: "tool" };
 */
export interface AgentObservedEdge {
  readonly relationship: AgentEdgeRelationship;
  readonly from: string;
  readonly to: string;
}

/** Optional external sink for observed agent relationships.
 * @example const sink: AgentObservabilitySink = { emit: (event) => send(event) };
 */
export interface AgentObservabilitySink {
  /** Accepts a public relationship event.
   * @param event - Versioned observed edge.
   * @returns Completion of best-effort sink delivery.
   * @example sink.emit({ protocol: "relkit.observability.hooks", version: 1, type: "edge.observed", edge });
   */
  readonly emit: (event: {
    readonly protocol: typeof AGENT_OBSERVABILITY_PROTOCOL;
    readonly version: typeof AGENT_OBSERVABILITY_VERSION;
    readonly type: "edge.observed";
    readonly edge: AgentObservedEdge;
  }) => MaybePromise<void>;
}

/** Optional synchronous and asynchronous relationship observers.
 * @example const hooks: AgentRuntimeHooks = { onObservedEdge: console.log };
 */
export interface AgentRuntimeHooks {
  /** Receives one immutable edge synchronously.
   * @param edge - Observed relationship.
   * @returns Nothing.
   * @example hooks.onObservedEdge?.(edge);
   */
  readonly onObservedEdge?: (edge: AgentObservedEdge) => void;
  readonly observability?: AgentObservabilitySink;
}
