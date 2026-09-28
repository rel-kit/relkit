import { normalizeId } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { isRecordEffect } from "./agent-validation-value.js";
import type { GraphDescriptor } from "./define-graph.js";
import { graphNodeValidationFailure } from "./graph-node-validation-error.js";
import { copyGraphNodeEndsEffect } from "./graph-node-validation.js";
import { RELKIT_SUBGRAPH, RELKIT_SUBGRAPH_NODE } from "./graph-subgraph-symbol.js";
import type { GraphAsNodeOptions, SubgraphNodeDescriptor } from "./graph-subgraph.types.js";

export type * from "./graph-subgraph.types.js";

/** Creates a native node backed by another graph.
 * @param graph - Graph to embed.
 * @param options - Optional node identity and destinations.
 * @returns An Effect with a frozen node or GraphNodeValidationFailure.
 * @example Effect.runSync(createSubgraphNodeEffect(graph, { id: "nested" }));
 */
export const createSubgraphNodeEffect = Effect.fn("Agents.graph.subgraphCreate")(
  function* <
    const Id extends string,
    InputSchema extends StandardSchemaV1,
    OutputSchema extends StandardSchemaV1,
  >(
    graph: GraphDescriptor<string, InputSchema, OutputSchema>,
    options: GraphAsNodeOptions<Id> = {},
  ) {
    if (!(yield* isRecordEffect(options))) {
      return yield* Effect.fail(
        graphNodeValidationFailure(new TypeError("Subgraph node options must be an object")),
      );
    }
    const id = yield* Effect.try({
      try: () => normalizeId(options.id ?? graph.id) as unknown as Id,
      catch: graphNodeValidationFailure,
    });
    const ends = yield* copyGraphNodeEndsEffect(options.ends);
    const descriptor = {
      [RELKIT_SUBGRAPH_NODE]: true as const,
      kind: "subgraph-node" as const,
      id,
      input: graph.input,
      output: graph.output,
      ends,
    };
    Object.defineProperty(descriptor, RELKIT_SUBGRAPH, { value: graph, enumerable: false });
    return Object.freeze(descriptor) as SubgraphNodeDescriptor<Id, InputSchema, OutputSchema>;
  },
  (effect) => observeAgent("graph.subgraph-create", effect),
);

/** Creates an embedded graph node for existing synchronous callers.
 * @param graph - Graph to embed.
 * @param options - Optional node identity and destinations.
 * @returns A frozen subgraph node.
 * @throws The original invalid options or destination error.
 * @example const node = createSubgraphNode(graph, { id: "nested" });
 */
export function createSubgraphNode<
  const Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
>(
  graph: GraphDescriptor<string, InputSchema, OutputSchema>,
  options: GraphAsNodeOptions<Id> = {},
): SubgraphNodeDescriptor<Id, InputSchema, OutputSchema> {
  return Effect.runSync(
    createSubgraphNodeEffect(graph, options).pipe(
      Effect.catchTag("GraphNodeValidationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

/** Checks whether a value is an embedded graph node.
 * @param value - Candidate node.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(isSubgraphNodeEffect(value));
 */
export const isSubgraphNodeEffect = Effect.fn("Agents.graph.subgraphIsNode")(
  function* (value: unknown) {
    if (!(yield* isRecordEffect(value))) return false;
    const record = value as Record<PropertyKey, unknown>;
    return (
      record[RELKIT_SUBGRAPH_NODE] === true &&
      record.kind === "subgraph-node" &&
      typeof record.id === "string" &&
      Array.isArray(record.ends) &&
      record[RELKIT_SUBGRAPH] !== undefined
    );
  },
  (effect) => observeAgent("graph.subgraph-is-node", effect),
);

/** Checks embedded graph nodes for existing synchronous callers.
 * @param value - Candidate node.
 * @returns Whether the value is an embedded graph node.
 * @example if (isSubgraphNode(value)) subgraphForNode(value);
 */
export function isSubgraphNode(value: unknown): value is SubgraphNodeDescriptor {
  return Effect.runSync(isSubgraphNodeEffect(value));
}

/** Reads the source graph from a subgraph node.
 * @param value - Embedded graph node.
 * @returns An Effect with the source descriptor.
 * @example Effect.runSync(subgraphForNodeEffect(node));
 */
export const subgraphForNodeEffect = Effect.fn("Agents.graph.subgraphSource")(
  (value: SubgraphNodeDescriptor) => Effect.sync(() => value[RELKIT_SUBGRAPH]),
  (effect) => observeAgent("graph.subgraph-source", effect),
);

/** Reads the source graph for existing synchronous callers.
 * @param value - Embedded graph node.
 * @returns The source graph descriptor.
 * @example const nested = subgraphForNode(node);
 */
export function subgraphForNode(value: SubgraphNodeDescriptor): GraphDescriptor {
  return Effect.runSync(subgraphForNodeEffect(value));
}
