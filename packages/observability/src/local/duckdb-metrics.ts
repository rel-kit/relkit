import { Clock, Duration, Effect, Exit, Metric } from "effect";
/**
 * Records bounded operation, duration, and outcome telemetry for DuckDB work.
 *
 * @param operation - Static operation label.
 * @param effect - Operation to observe.
 * @returns The same Effect with metrics updated on every exit.
 * @example
 * yield* observeDuckdb("append", appendBatch);
 */
export function observeDuckdb<A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const elapsed = (yield* Clock.currentTimeMillis) - started;
        yield* Metric.update(
          Metric.counter("relkit_observability_duckdb_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_duckdb_duration", {
            attributes: { operation },
          }),
          Duration.millis(elapsed),
        );
      }),
    );
  });
}
