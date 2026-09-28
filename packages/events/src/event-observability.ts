import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type { EventOperation, EventTelemetryService } from "./event-observability.types.js";

/** Substitutable telemetry for package operations.
 * @example Effect.provide(observeEvent("event.define", Effect.void), EventTelemetryLive)
 */
export class EventTelemetry extends Context.Service<EventTelemetry, EventTelemetryService>()(
  "relkit/events/EventTelemetry",
) {}

/** Default span and metric observer.
 * @example Effect.provide(observeEvent("event.define", Effect.void), EventTelemetryLive)
 */
export const EventTelemetryLive = Layer.succeed(EventTelemetry, { observe: observeLive });

const calls = Metric.counter("relkit_event_operations_total", { incremental: true });
const failures = Metric.counter("relkit_event_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_event_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Records a stable span, call count, failure count, and duration.
 * @param operation - Fixed operation label.
 * @param effect - Operation being observed.
 * @returns The original success and error channels.
 * @example observeEvent("event.define", Effect.succeed("created"))
 */
export function observeEvent<A, E, R>(
  operation: EventOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(EventTelemetry), (telemetry) =>
    Option.isSome(telemetry)
      ? telemetry.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

function observeLive<A, E, R>(
  operation: EventOperation,
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
    `events.${operation}`,
  );
}

/** Runs a dependency-free compatibility effect and rethrows its typed failure.
 * @param effect - Fully provided operation.
 * @returns Its successful value.
 * @throws The typed failure or an unexpected defect.
 * @example runEventSync(Effect.succeed(1))
 */
export function runEventSync<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
