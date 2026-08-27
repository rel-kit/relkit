import { GRAPH_VERSION } from "@relkit/contracts";
import type { GraphEdge, GraphEdgeKind, GraphNode } from "./model.js";

export interface ObservedEdge {
  readonly relationship: GraphEdgeKind;
  readonly from: string;
  readonly to: string;
}

export interface ApplicationGraph {
  readonly contractVersion: typeof GRAPH_VERSION;
  readonly appId?: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export type Graph = ApplicationGraph;
