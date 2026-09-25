import { GRAPH_VERSION } from "@relkit/contracts";
import type { GraphEdge, GraphEdgeKind, GraphNode } from "./model.js";

/**
 * Runtime-observed dependency edge.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: ObservedEdge): void => { console.log(value); };
 */
export interface ObservedEdge {
  readonly relationship: GraphEdgeKind;
  readonly from: string;
  readonly to: string;
}

/**
 * Versioned graph document consumed by runtime and deployment.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: ApplicationGraph): void => { console.log(value); };
 */
export interface ApplicationGraph {
  readonly contractVersion: typeof GRAPH_VERSION;
  readonly appId?: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/**
 * Alias for the application graph contract.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: Graph): void => { console.log(value); };
 */
export type Graph = ApplicationGraph;
