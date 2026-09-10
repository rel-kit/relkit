import type { StandardSchemaV1 } from "@relkit/schema";
import { normalizeId } from "@relkit/contracts";
import type { GraphDescriptor } from "./define-graph.js";
import { copyGraphNodeEnds } from "./graph-node-validation.js";
import { isRecord } from "./agent-validation.js";

const RELKIT_SUBGRAPH_NODE = Symbol.for("relkit.subgraph-node");
const RELKIT_SUBGRAPH = Symbol.for("relkit.subgraph");

export interface GraphAsNodeOptions<Id extends string = string> {
  readonly id?: Id;
  readonly ends?: readonly string[];
}

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

export function createSubgraphNode<
  const Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
>(
  graph: GraphDescriptor<string, InputSchema, OutputSchema>,
  options: GraphAsNodeOptions<Id> = {},
): SubgraphNodeDescriptor<Id, InputSchema, OutputSchema> {
  if (!isRecord(options)) throw new TypeError("Subgraph node options must be an object");
  const descriptor = {
    [RELKIT_SUBGRAPH_NODE]: true as const,
    kind: "subgraph-node" as const,
    id: normalizeId(options.id ?? graph.id) as unknown as Id,
    input: graph.input,
    output: graph.output,
    ends: copyGraphNodeEnds(options.ends),
  };
  Object.defineProperty(descriptor, RELKIT_SUBGRAPH, { value: graph, enumerable: false });
  return Object.freeze(descriptor) as SubgraphNodeDescriptor<Id, InputSchema, OutputSchema>;
}

export function isSubgraphNode(value: unknown): value is SubgraphNodeDescriptor {
  return (
    isRecord(value) &&
    value[RELKIT_SUBGRAPH_NODE] === true &&
    value.kind === "subgraph-node" &&
    typeof value.id === "string" &&
    Array.isArray(value.ends) &&
    value[RELKIT_SUBGRAPH] !== undefined
  );
}

export function subgraphForNode(value: SubgraphNodeDescriptor): GraphDescriptor {
  return value[RELKIT_SUBGRAPH];
}
