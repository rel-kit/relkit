/**
 * Applies validated edge mutations to one builder-owned operation log. Factories
 * retain that builder's closure so duplicate checks and mutation order stay local.
 */
import { END, START, type LangGraphRunnableConfig } from "@langchain/langgraph";
import type { MaybePromise } from "@relkit/contracts";
import { Effect } from "effect";
import { observeAgent } from "@relkit/agents/internal/agent-telemetry";
import { graphDefinitionFailure } from "./define-graph-error.js";
import { assertEndpoint, copyDestinations, addUnique } from "./graph-edge-destinations.js";
import type { GraphEdgeOperation } from "./graph-edges.types.js";
import type { GraphEdgeMutationContext } from "./graph-edge-mutations.types.js";

/** Creates conditional mutations sharing one checked operation log.
 * @param context - Registered nodes, duplicate signatures and builder identity.
 * @returns The existing observable conditional mutation operation.
 */
export function conditionalEdgeMutation<Id extends string, State>(
  context: GraphEdgeMutationContext<Id, State>,
) {
  const { nodeIds, operations, signatures } = context;
  return Effect.fn("Agents.graph.addConditionalEdge")(
    (
      source: typeof START | Id,
      route: (state: State, config: LangGraphRunnableConfig) => MaybePromise<unknown>,
      destinations?: Readonly<Record<string, Id | typeof END>>,
    ) =>
      Effect.try({
        try: () => {
          assertEndpoint(source, nodeIds, true);
          if (typeof route !== "function") throw new TypeError("Graph route must be a function");
          const map =
            destinations === undefined ? undefined : copyDestinations(destinations, nodeIds);
          addUnique(signatures, `conditional:${source}`);
          operations.push(
            Object.freeze({
              kind: "conditional",
              source,
              route,
              ...(map === undefined ? {} : { destinations: map }),
            }),
          );
          return context.builder();
        },
        catch: graphDefinitionFailure,
      }),
    (effect) => observeAgent("graph.add-conditional-edge", effect),
  );
}

/** Creates direct/join mutations sharing the same checked operation log.
 * @param context - Registered nodes, duplicate signatures and builder identity.
 * @returns The existing observable edge mutation operation.
 */
export function edgeMutation<Id extends string, State>(
  context: GraphEdgeMutationContext<Id, State>,
) {
  const { nodeIds, operations, signatures } = context;
  return Effect.fn("Agents.graph.addEdge")(
    (start: typeof START | Id | readonly Id[], end: Id | typeof END) =>
      Effect.try({
        try: () => {
          const starts = Array.isArray(start) ? start : [start];
          if (starts.length === 0 || new Set(starts).size !== starts.length) {
            throw new TypeError("Graph edge sources must be a non-empty unique list");
          }
          for (const value of starts) assertEndpoint(value, nodeIds, true);
          assertEndpoint(end, nodeIds, false);
          if (starts.length > 1 && end === END)
            throw new TypeError("Graph join destination must be a node");
          addUnique(signatures, `edge:${starts.join(",")}->${end}`);
          operations.push(
            Object.freeze({
              kind: "edge",
              start: Array.isArray(start) ? Object.freeze([...start]) : start,
              end,
            }) as GraphEdgeOperation<Id, State>,
          );
          return context.builder();
        },
        catch: graphDefinitionFailure,
      }),
    (effect) => observeAgent("graph.add-edge", effect),
  );
}
