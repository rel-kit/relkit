/**
 * Projects a compiled graph for flat/grouped compatibility checks. Only top-level
 * node source coordinates are omitted; nested schemas, route paths and deployment
 * configuration stay intact so a source move cannot conceal a contract change.
 */
import type { LayoutContract, LayoutNode, LayoutEdge } from "./layout-contract.types.js";

/**
 * Retains all logical graph fields in deterministic node/edge order.
 * @typeParam Node - Concrete node variants, whose contract fields are retained.
 * @typeParam Edge - Concrete dependency edges and their policy/member metadata.
 * @param graph - Accepted graph whose source provenance may change during movement.
 * @returns A pure comparison value without executable or physical source metadata.
 * @example
 * ```ts
 * import { layoutContract } from "./layout-contract.js";
 * const graph = { contractVersion: 1, nodes: [], edges: [] };
 * const contract = layoutContract(graph);
 * console.log(contract.contractVersion);
 * ```
 */
export function layoutContract<Node extends LayoutNode, Edge extends LayoutEdge>(graph: {
  readonly contractVersion: number;
  readonly appId?: string;
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
}): LayoutContract<Node, Edge> {
  return {
    contractVersion: graph.contractVersion,
    ...(graph.appId === undefined ? {} : { appId: graph.appId }),
    nodes: graph.nodes
      .map(({ source: _source, ...node }) => node)
      .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`)),
    edges: [...graph.edges].sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    ),
  };
}
