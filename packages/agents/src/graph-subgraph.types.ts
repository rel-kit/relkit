import type { StandardSchemaV1 } from "@relkit/schema";
import type { GraphDescriptor } from "./define-graph.js";
import type { RELKIT_SUBGRAPH, RELKIT_SUBGRAPH_NODE } from "./graph-subgraph-symbol.js";

/** Authoring options for a graph embedded as a node. */
export interface GraphAsNodeOptions<Id extends string = string> {
  readonly id?: Id;
  readonly ends?: readonly string[];
}

/** Native graph node whose action is another graph. */
export interface SubgraphNodeDescriptor<
  Id extends string = string,
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  readonly [RELKIT_SUBGRAPH_NODE]: true;
  readonly kind: "subgraph-node";
  readonly id: Id;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly ends: readonly string[];
  readonly [RELKIT_SUBGRAPH]: GraphDescriptor;
}
