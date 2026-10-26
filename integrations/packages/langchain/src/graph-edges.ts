/** Defines typed native graph edge and routing descriptors whose endpoints are checked during graph assembly and compilation. */

import { conditionalEdgeMutation, edgeMutation } from "./graph-edge-mutations.js";
import { assertEndpoint, copyDestinations, addUnique } from "./graph-edge-destinations.js";
import { END, START, type LangGraphRunnableConfig } from "@langchain/langgraph";
import type { MaybePromise } from "@relkit/contracts";
import { Effect } from "effect";
import { observeAgent } from "@relkit/agents/internal/agent-telemetry";
import { graphDefinitionFailure } from "./define-graph-error.js";
import type { GraphEdgeBuilder, GraphEdgeOperation } from "./graph-edges.types.js";

export type * from "./graph-edges.types.js";
/** Creates an edge builder whose mutations run through Effect.
 * @param nodeIds - Registered node identities.
 * @returns An Effect with a builder and its ordered operation log.
 * @example Effect.runSync(createGraphEdgeBuilderEffect(ids));
 */
export const createGraphEdgeBuilderEffect = Effect.fn("Agents.graph.edgeBuilder")(
  <Id extends string, State>(nodeIds: ReadonlySet<Id>) =>
    Effect.sync(() => {
      const operations: GraphEdgeOperation<Id, State>[] = [];
      const signatures = new Set<string>();
      let builder!: GraphEdgeBuilder<Id, State>;
      const context = { nodeIds, operations, signatures, builder: () => builder };
      const addConditionalEdgesEffect = conditionalEdgeMutation(context);
      const addEdgeEffect = edgeMutation(context);
      builder = {
        addEdge(start, end) {
          return Effect.runSync(
            addEdgeEffect(start, end).pipe(
              Effect.catchTag("GraphDefinitionFailure", (failure) => Effect.fail(failure.cause)),
            ),
          );
        },
        addConditionalEdges: ((source, route, destinations) =>
          Effect.runSync(
            addConditionalEdgesEffect(source, route, destinations).pipe(
              Effect.catchTag("GraphDefinitionFailure", (failure) => Effect.fail(failure.cause)),
            ),
          )) as GraphEdgeBuilder<Id, State>["addConditionalEdges"],
      };
      return { builder: Object.freeze(builder), operations };
    }),
  (effect) => observeAgent("graph.edge-builder", effect),
);

/** Creates an edge builder for existing synchronous graph authoring.
 * @param nodeIds - Registered node identities.
 * @returns A builder and its ordered operation log.
 * @example const { builder, operations } = createGraphEdgeBuilder(ids);
 */
export function createGraphEdgeBuilder<Id extends string, State>(
  nodeIds: ReadonlySet<Id>,
): {
  readonly builder: GraphEdgeBuilder<Id, State>;
  readonly operations: readonly GraphEdgeOperation<Id, State>[];
} {
  return Effect.runSync(createGraphEdgeBuilderEffect<Id, State>(nodeIds));
}

export {
  assertGraphDestination,
  assertGraphDestinationEffect,
  validateGraphRoute,
  validateGraphRouteEffect,
} from "./graph-edge-destinations.js";
