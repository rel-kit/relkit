import type { GRAPH_VERSION, SourceLocation } from "@relkit/contracts";

/** Compiler node projection validated by the authoritative graph contract during canonicalization. */
export interface GraphNode {
  readonly kind: string;
  readonly id: string;
  readonly source: SourceLocation;
  readonly [key: string]: unknown;
}

/** Compiler dependency edge validated by the graph contract during canonicalization. */
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

/** Canonical graph with deterministic node and edge ordering. */
export interface NormalizedGraph {
  readonly contractVersion: typeof GRAPH_VERSION;
  readonly appId?: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}
