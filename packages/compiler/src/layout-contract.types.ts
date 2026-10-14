/**
 * Describes the logical graph retained during a service source move. The compiler
 * compares every contract field and edge while omitting only node provenance;
 * executable manifests and build hashes are validated separately.
 */
import type { SourceLocation } from "@relkit/contracts";

/** Common validated identity/provenance shared by every graph node variant. */
export interface LayoutNode {
  readonly kind: string;
  readonly id: string;
  readonly source: SourceLocation;
}

/** Common dependency identity; concrete edges retain their policy/member fields. */
export interface LayoutEdge {
  readonly kind: string;
  readonly from: string;
  readonly to: string;
}

/** Removes a node's source coordinates while retaining its complete variant. */
export type LogicalNode<Node extends LayoutNode> = Node extends LayoutNode
  ? Omit<Node, "source">
  : never;

/** Identity, policy, provider, ownership and transport contracts for comparison. */
export interface LayoutContract<Node extends LayoutNode, Edge extends LayoutEdge> {
  readonly contractVersion: number;
  readonly appId?: string;
  readonly nodes: readonly Omit<Node, "source">[];
  readonly edges: readonly Edge[];
}
