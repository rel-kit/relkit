import type { ApplicationGraph, ClientRoute } from "./generator-graph-operation.types.js";
import { Effect } from "effect";
import { clientRoutesEffect, MissingRouteTarget } from "./generate-types.js";
import { observeGenerator, runGenerator } from "./generator-observability.js";
/** Creates a graph generator Effect that retains route resolution failures.
 * @param name - Static operation name for telemetry.
 * @param calculate - Effect rendering after route validation; it must not call synchronous adapters.
 * @returns An Effect yielding the operation pair with no expected failure.
 * @example Effect.runSync(makeGraphOperationEffect("render", (graph: ApplicationGraph) => Effect.succeed(graph.nodes.length)));
 */
export function makeGraphOperationEffect<Rest extends unknown[], A, E = never>(
  name: string,
  calculate: (
    graph: ApplicationGraph,
    routes: readonly ClientRoute[],
    ...rest: Rest
  ) => Effect.Effect<A, E>,
): Effect.Effect<{
  readonly effect: (
    graph: ApplicationGraph,
    ...rest: Rest
  ) => Effect.Effect<A, E | MissingRouteTarget>;
  readonly run: (graph: ApplicationGraph, ...rest: Rest) => A;
}> {
  return observeGenerator(
    "makeGraphOperation",
    Effect.sync(() => {
      const effect = Effect.fn(`clientGenerator.${name}`)(
        (graph: ApplicationGraph, ...rest: Rest) =>
          observeGenerator(
            name,
            Effect.flatMap(clientRoutesEffect(graph), (routes) =>
              calculate(graph, routes, ...rest),
            ),
          ),
      );
      const run = (graph: ApplicationGraph, ...rest: Rest): A => {
        try {
          return runGenerator(effect(graph, ...rest));
        } catch (error) {
          if (error instanceof MissingRouteTarget) {
            throw new TypeError(
              `HTTP trigger "${error.triggerId}" targets missing function "${error.targetFunctionId}".`,
            );
          }
          throw error;
        }
      };
      return { effect, run };
    }),
  );
}
/** Creates an observed graph operation for synchronous module setup.
 * @param name - Static operation name for telemetry.
 * @param calculate - Effect rendering after route validation.
 * @returns The graph Effect and synchronous compatibility adapter.
 * @throws If operation setup defects.
 * @example const operation = makeGraphOperation("render", (graph: ApplicationGraph) => Effect.succeed(graph.nodes.length));
 */
export function makeGraphOperation<Rest extends unknown[], A, E = never>(
  name: string,
  calculate: (
    graph: ApplicationGraph,
    routes: readonly ClientRoute[],
    ...rest: Rest
  ) => Effect.Effect<A, E>,
): {
  readonly effect: (
    graph: ApplicationGraph,
    ...rest: Rest
  ) => Effect.Effect<A, E | MissingRouteTarget>;
  readonly run: (graph: ApplicationGraph, ...rest: Rest) => A;
} {
  return runGenerator(makeGraphOperationEffect(name, calculate));
}
