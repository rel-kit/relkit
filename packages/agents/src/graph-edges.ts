import { END, START, Send, type LangGraphRunnableConfig } from "@langchain/langgraph";
import type { MaybePromise } from "@relkit/contracts";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { graphDefinitionFailure } from "./define-graph-error.js";
import type { GraphEdgeBuilder, GraphEdgeOperation } from "./graph-edges.types.js";

export type * from "./graph-edges.types.js";
/** Creates an edge builder whose mutations run through Effect.
 * @param nodeIds - Registered node identities.
 * @returns An Effect with a builder and its ordered operation log.
 * @example Effect.runSync(createGraphEdgeBuilderEffect(ids));
 */
export const createGraphEdgeBuilderEffect = Effect.fn("Agents.graph.edgeBuilder")(<Id extends string, State>(
  nodeIds: ReadonlySet<Id>,
) => Effect.sync(() => {
  const operations: GraphEdgeOperation<Id, State>[] = [];
  const signatures = new Set<string>();
  let builder!: GraphEdgeBuilder<Id, State>;
  const addConditionalEdgesEffect = Effect.fn("Agents.graph.addConditionalEdge")((
    source: typeof START | Id,
    route: (state: State, config: LangGraphRunnableConfig) => MaybePromise<unknown>,
    destinations?: Readonly<Record<string, Id | typeof END>>,
  ) => Effect.try({ try: () => {
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
  }, catch: graphDefinitionFailure }),
  (effect) => observeAgent("graph.add-conditional-edge", effect));
  const addEdgeEffect = Effect.fn("Agents.graph.addEdge")((
    start: typeof START | Id | readonly Id[], end: Id | typeof END,
  ) => Effect.try({ try: () => {
    const starts = Array.isArray(start) ? start : [start];
    if (starts.length === 0 || new Set(starts).size !== starts.length) {
      throw new TypeError("Graph edge sources must be a non-empty unique list");
    }
    for (const value of starts) assertEndpoint(value, nodeIds, true);
    assertEndpoint(end, nodeIds, false);
    if (starts.length > 1 && end === END) throw new TypeError("Graph join destination must be a node");
    addUnique(signatures, `edge:${starts.join(",")}->${end}`);
    operations.push(Object.freeze({
      kind: "edge", start: Array.isArray(start) ? Object.freeze([...start]) : start, end,
    }) as GraphEdgeOperation<Id, State>);
    return builder;
  }, catch: graphDefinitionFailure }),
  (effect) => observeAgent("graph.add-edge", effect));
  builder = {
    addEdge(start, end) {
      return Effect.runSync(addEdgeEffect(start, end).pipe(
        Effect.catchTag("GraphDefinitionFailure", (failure) => Effect.fail(failure.cause)),
      ));
    },
    addConditionalEdges: ((source, route, destinations) => Effect.runSync(
      addConditionalEdgesEffect(source, route, destinations).pipe(
        Effect.catchTag("GraphDefinitionFailure", (failure) => Effect.fail(failure.cause)),
      ),
    )) as GraphEdgeBuilder<Id, State>["addConditionalEdges"],
  };
  return { builder: Object.freeze(builder), operations };
}), (effect) => observeAgent("graph.edge-builder", effect));

/** Creates an edge builder for existing synchronous graph authoring.
 * @param nodeIds - Registered node identities.
 * @returns A builder and its ordered operation log.
 * @example const { builder, operations } = createGraphEdgeBuilder(ids);
 */
export function createGraphEdgeBuilder<Id extends string, State>(nodeIds: ReadonlySet<Id>): {
  readonly builder: GraphEdgeBuilder<Id, State>;
  readonly operations: readonly GraphEdgeOperation<Id, State>[];
} {
  return Effect.runSync(createGraphEdgeBuilderEffect<Id, State>(nodeIds));
}

/** Checks native route targets against registered nodes.
 * @param value - One destination or a destination list.
 * @param nodeIds - Registered node identities.
 * @returns An Effect with void or GraphDefinitionFailure.
 * @example Effect.runSync(assertGraphDestinationEffect("next", ids));
 */
export const assertGraphDestinationEffect = Effect.fn("Agents.graph.destination")(<Id extends string>(
  value: unknown, nodeIds: ReadonlySet<Id>,
) => Effect.try({ try: () => assertGraphDestinationCore(value, nodeIds), catch: graphDefinitionFailure }),
  (effect) => observeAgent("graph.destination", effect));

/** Checks native route targets for existing synchronous callers.
 * @param value - One destination or a destination list.
 * @param nodeIds - Registered node identities.
 * @returns Nothing when all destinations are known.
 * @throws The original invalid destination error.
 * @example assertGraphDestination("next", ids);
 */
export function assertGraphDestination<Id extends string>(value: unknown, nodeIds: ReadonlySet<Id>): void {
  Effect.runSync(assertGraphDestinationEffect(value, nodeIds).pipe(
    Effect.catchTag("GraphDefinitionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function assertGraphDestinationCore<Id extends string>(
  value: unknown,
  nodeIds: ReadonlySet<Id>,
): void {
  const values = Array.isArray(value) ? value : [value];
  for (const destination of values) {
    const id = destination instanceof Send ? destination.node : destination;
    assertEndpoint(id, nodeIds, false);
  }
}

/** Validates dynamic route labels or node destinations.
 * @param value - Route result.
 * @param nodeIds - Registered node identities.
 * @param destinations - Optional label mapping.
 * @returns An Effect with void or GraphDefinitionFailure.
 * @example Effect.runSync(validateGraphRouteEffect("yes", ids, { yes: "next" }));
 */
export const validateGraphRouteEffect = Effect.fn("Agents.graph.validateRoute")(<Id extends string>(
  value: unknown,
  nodeIds: ReadonlySet<Id>,
  destinations?: Readonly<Record<string, Id | typeof END>>,
) => Effect.try({ try: () => validateGraphRouteCore(value, nodeIds, destinations), catch: graphDefinitionFailure }),
  (effect) => observeAgent("graph.validate-route", effect));

/** Validates dynamic routes for existing synchronous callers.
 * @param value - Route result.
 * @param nodeIds - Registered node identities.
 * @param destinations - Optional label mapping.
 * @returns Nothing when all route targets are valid.
 * @throws The original invalid route error.
 * @example validateGraphRoute("yes", ids, { yes: "next" });
 */
export function validateGraphRoute<Id extends string>(
  value: unknown,
  nodeIds: ReadonlySet<Id>,
  destinations?: Readonly<Record<string, Id | typeof END>>,
): void {
  Effect.runSync(validateGraphRouteEffect(value, nodeIds, destinations).pipe(
    Effect.catchTag("GraphDefinitionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function validateGraphRouteCore<Id extends string>(
  value: unknown,
  nodeIds: ReadonlySet<Id>,
  destinations?: Readonly<Record<string, Id | typeof END>>,
): void {
  for (const destination of Array.isArray(value) ? value : [value]) {
    if (destination instanceof Send) {
      assertGraphDestinationCore(destination, nodeIds);
      continue;
    }
    if (destinations !== undefined && typeof destination === "string") {
      if (Object.hasOwn(destinations, destination)) continue;
      throw new TypeError(`Unknown graph route label "${destination}"`);
    }
    assertGraphDestinationCore(destination, nodeIds);
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
