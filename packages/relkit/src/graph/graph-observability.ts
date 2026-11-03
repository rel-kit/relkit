import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type { GraphOperation, GraphTelemetryService } from "./graph-observability.types.js";
export type { GraphOperation, GraphTelemetryService } from "./graph-observability.types.js";
/**
 * Injectable tracing and metrics service for graph operations.
 * @example Effect.provide(graphIdEffect("task", "orders.send"), GraphTelemetryLive);
 */
export class GraphTelemetry extends Context.Service<GraphTelemetry, GraphTelemetryService>()(
  "relkit/graph/GraphTelemetry",
) {}
/**
 * Live graph telemetry backed by Effect spans, Clock, and Metric.
 * @example Effect.runSync(Effect.provide(graphIdEffect("task", "orders.send"), GraphTelemetryLive));
 */
export const GraphTelemetryLive = Layer.succeed(GraphTelemetry, { observe: observeLive });
const calls = Metric.counter("relkit_graph_operations_total", { incremental: true });
const failures = Metric.counter("relkit_graph_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_graph_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});
/**
 * Observes a graph operation using an injected telemetry Layer or the live service.
 * @param operation - Stable name used for the span and only metric attribute.
 * @param effect - Graph operation to observe.
 * @returns The original Effect success and error channels with telemetry attached.
 * @example observeGraph("id.graph", Effect.succeed("task.orders.send"));
 */
export function observeGraph<A, E, R>(
  operation: GraphOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(GraphTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}
function observeLive<A, E, R>(
  operation: GraphOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const attributes = { operation };
  return Effect.withSpan(
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis;
      yield* Metric.update(Metric.withAttributes(calls, attributes), 1);
      return yield* Effect.onExit(effect, (exit) =>
        Effect.gen(function* () {
          const elapsed = (yield* Clock.currentTimeMillis) - started;
          yield* Metric.update(Metric.withAttributes(duration, attributes), Math.max(0, elapsed));
          if (Exit.isFailure(exit))
            yield* Metric.update(Metric.withAttributes(failures, attributes), 1);
        }),
      );
    }),
    `graph.${operation}`,
  );
}
/**
 * Runs a synchronous graph compatibility adapter while preserving its failure.
 * @param effect - Fully provided synchronous Effect implementation.
 * @returns The Effect success value.
 * @throws The Effect failure or defect when execution fails.
 * @example runGraph(Effect.succeed("task.orders.send"));
 */
export function runGraph<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
