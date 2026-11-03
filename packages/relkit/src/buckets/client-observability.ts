import { Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type { BucketTelemetryService } from "./client-observability.types.js";
import type { BucketOperation } from "./client.types.js";

/** Injectable observer for bucket Effect operations.
 * @example Effect.provide(getBucketEffect("a"), BucketTelemetryLive);
 */
export class BucketTelemetry extends Context.Service<BucketTelemetry, BucketTelemetryService>()(
  "relkit/buckets/BucketTelemetry",
) {}

/** Live bucket spans and bounded Effect metrics.
 * @example Effect.provide(getBucketEffect("a"), BucketTelemetryLive);
 */
export const BucketTelemetryLive = Layer.succeed(BucketTelemetry, { observe: observeLive });

const calls = Metric.counter("relkit_bucket_operations_total", { incremental: true });
const failures = Metric.counter("relkit_bucket_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_bucket_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Measures an operation using fixed operation labels.
 * @param operation - One of the fixed bucket operation names.
 * @param effect - Operation to observe.
 * @returns The input Effect with its success and error channels intact.
 * @example observeBucket("get", Effect.succeed(undefined));
 */
export function observeBucket<A, E, R>(
  operation:
    | BucketOperation
    | "define"
    | "isDescriptor"
    | "assertDescriptor"
    | "createClient"
    | "asProvider",
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(BucketTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

/** Record one stable span and one set of bounded operation metrics. */
function observeLive<A, E, R>(
  operation:
    | BucketOperation
    | "define"
    | "isDescriptor"
    | "assertDescriptor"
    | "createClient"
    | "asProvider",
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const attributes = { operation };
  return Effect.withSpan(
    Effect.gen(function* () {
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
    }),
    `bucket.${operation}`,
  );
}
