/**
 * Validates native graph endpoints and conditional route results before execution.
 * Mutation builders reuse the same endpoint and duplicate-edge rules.
 */
import { END, START, Send } from "@langchain/langgraph";
import { Effect } from "effect";
import { observeAgent } from "@relkit/agents/internal/agent-telemetry";
import { graphDefinitionFailure } from "./define-graph-error.js";

/** Checks native route targets against registered nodes.
 * @param value - One destination or a destination list.
 * @param nodeIds - Registered node identities.
 * @returns An Effect with void or GraphDefinitionFailure.
 * @example Effect.runSync(assertGraphDestinationEffect("next", ids));
 */
export const assertGraphDestinationEffect = Effect.fn("Agents.graph.destination")(
  <Id extends string>(value: unknown, nodeIds: ReadonlySet<Id>) =>
    Effect.try({
      try: () => assertGraphDestinationCore(value, nodeIds),
      catch: graphDefinitionFailure,
    }),
  (effect) => observeAgent("graph.destination", effect),
);

/** Checks native route targets for existing synchronous callers.
 * @param value - One destination or a destination list.
 * @param nodeIds - Registered node identities.
 * @returns Nothing when all destinations are known.
 * @throws The original invalid destination error.
 * @example assertGraphDestination("next", ids);
 */
export function assertGraphDestination<Id extends string>(
  value: unknown,
  nodeIds: ReadonlySet<Id>,
): void {
  Effect.runSync(
    assertGraphDestinationEffect(value, nodeIds).pipe(
      Effect.catchTag("GraphDefinitionFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
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
export const validateGraphRouteEffect = Effect.fn("Agents.graph.validateRoute")(
  <Id extends string>(
    value: unknown,
    nodeIds: ReadonlySet<Id>,
    destinations?: Readonly<Record<string, Id | typeof END>>,
  ) =>
    Effect.try({
      try: () => validateGraphRouteCore(value, nodeIds, destinations),
      catch: graphDefinitionFailure,
    }),
  (effect) => observeAgent("graph.validate-route", effect),
);

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
  Effect.runSync(
    validateGraphRouteEffect(value, nodeIds, destinations).pipe(
      Effect.catchTag("GraphDefinitionFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
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

export function copyDestinations<Id extends string>(
  value: Readonly<Record<string, Id | typeof END>>,
  nodeIds: ReadonlySet<Id>,
) {
  const entries = Object.entries(value);
  if (entries.length === 0) throw new TypeError("Graph route destinations cannot be empty");
  for (const [, destination] of entries) assertEndpoint(destination, nodeIds, false);
  return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<string, Id | typeof END>>;
}

export function assertEndpoint<Id extends string>(
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

export function addUnique(signatures: Set<string>, signature: string): void {
  if (signatures.has(signature)) throw new TypeError("Duplicate graph edge");
  signatures.add(signature);
}
