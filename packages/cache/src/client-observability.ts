import { Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type {
  CacheObservedOperation,
  CacheTelemetryService,
} from "./client-observability.types.js";
/** Injectable telemetry for cache Effect operations.
 * @example Effect.provide(getCacheEffect("sku"), CacheTelemetryLive);
 */
export class CacheTelemetry extends Context.Service<CacheTelemetry, CacheTelemetryService>()(
  "relkit/cache/CacheTelemetry",
) {}
/** Default spans and bounded Effect metrics.
 * @example Effect.provide(getCacheEffect("sku"), CacheTelemetryLive);
 */
export const CacheTelemetryLive = Layer.succeed(CacheTelemetry, { observe: observeLive });
const calls = Metric.counter("relkit_cache_operations_total", { incremental: true });
const failures = Metric.counter("relkit_cache_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_cache_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});
/** Observes an operation through an optional test Layer or default telemetry.
 * @param operation - Stable cache operation name.
 * @param effect - Work to observe.
 * @returns The same success and error channels with operation metrics; the calling Effect.fn supplies the span.
 * @example observeCache("get", Effect.succeed(undefined));
 */
export function observeCache<A, E, R>(
  operation: CacheObservedOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(CacheTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}
/** Records bounded call, failure, and duration measurements. */
function observeLive<A, E, R>(
  operation: CacheObservedOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const attributes = { operation };
  return Effect.gen(function* () {
    const started = yield* Clock.monotonicTimeNanos;
    yield* Metric.update(Metric.withAttributes(calls, attributes), 1);
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const elapsed = Number((yield* Clock.monotonicTimeNanos) - started) / 1_000_000;
        yield* Metric.update(Metric.withAttributes(duration, attributes), Math.max(0, elapsed));
        if (Exit.isFailure(exit))
          yield* Metric.update(Metric.withAttributes(failures, attributes), 1);
      }),
    );
  });
}
