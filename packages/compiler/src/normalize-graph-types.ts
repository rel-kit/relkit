import { GRAPH_VERSION, type SourceLocation } from "@relkit/contracts";

export interface GraphNode {
  readonly kind: string;
  readonly id: string;
  readonly source: SourceLocation;
  readonly [key: string]: unknown;
}

export interface GraphEdge {
  readonly kind: string;
  readonly from: string;
  readonly to: string;
  readonly [key: string]: unknown;
}

/** Runtime relationships kept outside the canonical graph contract. */
export interface ObservedEdge {
  readonly relationship: string;
  readonly from: string;
  readonly to: string;
}

export interface NormalizedGraph {
  readonly contractVersion: typeof GRAPH_VERSION;
  readonly appId?: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}
