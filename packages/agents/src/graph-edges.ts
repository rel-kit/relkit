import { END, START, Send, type LangGraphRunnableConfig } from "@langchain/langgraph";
import type { MaybePromise } from "@relkit/contracts";

export type GraphRoute<Id extends string, State> = (
  state: State,
  config: LangGraphRunnableConfig,
) => MaybePromise<Id | typeof END | Send<Id> | readonly (Id | Send<Id>)[]>;

export type GraphConditionalRoute<Id extends string, State, Key extends string> = (
  state: State,
  config: LangGraphRunnableConfig,
) => MaybePromise<Key | Send<Id, Partial<State>> | readonly (Key | Send<Id, Partial<State>>)[]>;

export interface GraphEdgeBuilder<Id extends string, State> {
  addEdge(
    start: typeof START | NoInfer<Id> | readonly NoInfer<Id>[],
    end: NoInfer<Id> | typeof END,
  ): GraphEdgeBuilder<Id, State>;
  addConditionalEdges(
    source: typeof START | NoInfer<Id>,
    route: GraphRoute<NoInfer<Id>, State>,
  ): GraphEdgeBuilder<Id, State>;
  addConditionalEdges<const Key extends string>(
    source: typeof START | NoInfer<Id>,
    route: GraphConditionalRoute<NoInfer<Id>, State, Key>,
    destinations: Readonly<Record<Key, NoInfer<Id> | typeof END>>,
  ): GraphEdgeBuilder<Id, State>;
}

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

export function createGraphEdgeBuilder<Id extends string, State>(
  nodeIds: ReadonlySet<Id>,
): {
  readonly builder: GraphEdgeBuilder<Id, State>;
  readonly operations: readonly GraphEdgeOperation<Id, State>[];
} {
  const operations: GraphEdgeOperation<Id, State>[] = [];
  const signatures = new Set<string>();
  let builder!: GraphEdgeBuilder<Id, State>;
  const addConditionalEdges = function (
    source: typeof START | Id,
    route: (state: State, config: LangGraphRunnableConfig) => MaybePromise<unknown>,
    destinations?: Readonly<Record<string, Id | typeof END>>,
  ) {
    assertEndpoint(source, nodeIds, true);
    if (typeof route !== "function") throw new TypeError("Graph route must be a function");
    const map = destinations === undefined ? undefined : copyDestinations(destinations, nodeIds);
    addUnique(signatures, `conditional:${source}`);
    operations.push(
      Object.freeze({
        kind: "conditional",
        source,
        route,
        ...(map === undefined ? {} : { destinations: map }),
      }),
    );
    return builder;
  } as GraphEdgeBuilder<Id, State>["addConditionalEdges"];
  builder = {
    addEdge(start, end) {
      const starts = Array.isArray(start) ? start : [start];
      if (starts.length === 0 || new Set(starts).size !== starts.length) {
        throw new TypeError("Graph edge sources must be a non-empty unique list");
      }
      for (const value of starts) assertEndpoint(value, nodeIds, true);
      assertEndpoint(end, nodeIds, false);
      if (starts.length > 1 && end === END) {
        throw new TypeError("Graph join destination must be a node");
      }
      addUnique(signatures, `edge:${starts.join(",")}->${end}`);
      operations.push(
        Object.freeze({
          kind: "edge",
          start: Array.isArray(start) ? Object.freeze([...start]) : start,
          end,
        }) as GraphEdgeOperation<Id, State>,
      );
      return builder;
    },
    addConditionalEdges,
  };
  return { builder: Object.freeze(builder), operations };
}

export function assertGraphDestination<Id extends string>(
  value: unknown,
  nodeIds: ReadonlySet<Id>,
): void {
  const values = Array.isArray(value) ? value : [value];
  for (const destination of values) {
    const id = destination instanceof Send ? destination.node : destination;
    assertEndpoint(id, nodeIds, false);
  }
}

export function validateGraphRoute<Id extends string>(
  value: unknown,
  nodeIds: ReadonlySet<Id>,
  destinations?: Readonly<Record<string, Id | typeof END>>,
): void {
  for (const destination of Array.isArray(value) ? value : [value]) {
    if (destination instanceof Send) {
      assertGraphDestination(destination, nodeIds);
      continue;
    }
    if (destinations !== undefined && typeof destination === "string") {
      if (Object.hasOwn(destinations, destination)) continue;
      throw new TypeError(`Unknown graph route label "${destination}"`);
    }
    assertGraphDestination(destination, nodeIds);
  }
}

function copyDestinations<Id extends string>(
  value: Readonly<Record<string, Id | typeof END>>,
  nodeIds: ReadonlySet<Id>,
) {
  const entries = Object.entries(value);
  if (entries.length === 0) throw new TypeError("Graph route destinations cannot be empty");
  for (const [, destination] of entries) assertEndpoint(destination, nodeIds, false);
  return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<string, Id | typeof END>>;
}

function assertEndpoint<Id extends string>(
  value: unknown,
  nodeIds: ReadonlySet<Id>,
  source: boolean,
): asserts value is Id | typeof START | typeof END {
  if (value === START) {
    if (!source) throw new TypeError("Graph START cannot be an edge destination");
    return;
  }
  if (value === END) {
    if (source) throw new TypeError("Graph END cannot be an edge source");
    return;
  }
  if (typeof value !== "string" || !nodeIds.has(value as Id)) {
    throw new TypeError(`Unknown graph node "${String(value)}"`);
  }
}

function addUnique(signatures: Set<string>, signature: string): void {
  if (signatures.has(signature)) throw new TypeError("Duplicate graph edge");
  signatures.add(signature);
}
