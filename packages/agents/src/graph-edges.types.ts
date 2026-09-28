import type { END, START, LangGraphRunnableConfig, Send } from "@langchain/langgraph";
import type { MaybePromise } from "@relkit/contracts";

/** Native graph conditional route callback. */
export type GraphRoute<Id extends string, State> = (
  state: State,
  config: LangGraphRunnableConfig,
) => MaybePromise<Id | typeof END | Send<Id> | readonly (Id | Send<Id>)[]>;

/** Label based graph conditional route callback. */
export type GraphConditionalRoute<Id extends string, State, Key extends string> = (
  state: State,
  config: LangGraphRunnableConfig,
) => MaybePromise<Key | Send<Id, Partial<State>> | readonly (Key | Send<Id, Partial<State>>)[]>;

/** Mutable graph edge authoring interface backed by Effect operations. */
export interface GraphEdgeBuilder<Id extends string, State> {
  /** Adds a static or join edge.
   * @param start - One or more source nodes.
   * @param end - Destination node.
   * @returns This builder.
   * @throws TypeError for invalid or duplicate edges.
   * @example edge.addEdge("start", "finish");
   */
  addEdge(
    start: typeof START | NoInfer<Id> | readonly NoInfer<Id>[],
    end: NoInfer<Id> | typeof END,
  ): GraphEdgeBuilder<Id, State>;
  /** Adds a dynamic edge.
   * @param source - Source node.
   * @param route - Route callback.
   * @returns This builder.
   * @throws TypeError for invalid or duplicate routes.
   * @example edge.addConditionalEdges("start", () => "finish");
   */
  addConditionalEdges(
    source: typeof START | NoInfer<Id>,
    route: GraphRoute<NoInfer<Id>, State>,
  ): GraphEdgeBuilder<Id, State>;
  /** Adds a labeled dynamic edge.
   * @param source - Source node.
   * @param route - Route callback.
   * @param destinations - Label to destination mapping.
   * @returns This builder.
   * @throws TypeError for invalid or duplicate routes.
   * @example edge.addConditionalEdges("start", () => "yes", { yes: "finish" });
   */
  addConditionalEdges<const Key extends string>(
    source: typeof START | NoInfer<Id>,
    route: GraphConditionalRoute<NoInfer<Id>, State, Key>,
    destinations: Readonly<Record<Key, NoInfer<Id> | typeof END>>,
  ): GraphEdgeBuilder<Id, State>;
}

/** Recorded edge operation consumed by the LangGraph compiler. */
export type GraphEdgeOperation<Id extends string, State> =
  | {
      readonly kind: "edge";
      readonly start: typeof START | Id | readonly Id[];
      readonly end: Id | typeof END;
    }
  | {
      readonly kind: "conditional";
      readonly source: typeof START | Id;
      readonly route: (state: State, config: LangGraphRunnableConfig) => MaybePromise<unknown>;
      readonly destinations?: Readonly<Record<string, Id | typeof END>>;
    };
