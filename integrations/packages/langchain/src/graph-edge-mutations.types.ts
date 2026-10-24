/** One graph builder's private ordered mutation authority. */
import type { GraphEdgeBuilder, GraphEdgeOperation } from "./graph-edges.types.js";
export interface GraphEdgeMutationContext<Id extends string, State> {
  readonly nodeIds: ReadonlySet<Id>;
  readonly operations: GraphEdgeOperation<Id, State>[];
  readonly signatures: Set<string>;
  readonly builder: () => GraphEdgeBuilder<Id, State>;
}
