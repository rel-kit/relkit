import { JsonValueError, StableIdError } from "@relkit/contracts";
import { createUnboundIdentityEffect, DescriptorIdentityError } from "@relkit/invocation";
import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option, Schema } from "effect";
import type { RouteOperation, RouteTelemetryService } from "./route-observability.types.js";

export type { RouteOperation, RouteTelemetryService } from "./route-observability.types.js";

/** Marks invalid route authoring input while preserving TypeError compatibility.
 * @example throw new RouteInputError("Route target is invalid");
 */
export class RouteInputError extends TypeError {}

/** Expected failure from a route authoring Effect.
 * @example const error = new RouteOperationError({ operation: "route.define", reason: "Invalid route", cause: new TypeError("Invalid route") });
 */
export class RouteOperationError extends Schema.TaggedError<RouteOperationError>()(
  "RouteOperationError",
  { operation: Schema.String, reason: Schema.String, cause: Schema.Defect() },
) {}

/** Injectable observer for route authoring operations.
 * @example Effect.provide(defineRouteEffect(options), RouteTelemetryLive);
 */
export class RouteTelemetry extends Context.Service<RouteTelemetry, RouteTelemetryService>()(
  "relkit/routes/RouteTelemetry",
) {}

const calls = Metric.counter("relkit_route_operations_total", { incremental: true });
const failures = Metric.counter("relkit_route_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_route_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Default route observer with an Effect span, counters, and duration histogram.
 * @example Effect.runSync(Effect.provide(Effect.void, RouteTelemetryLive));
 */
export const RouteTelemetryLive = Layer.succeed(RouteTelemetry, { observe: observeLive });

/** Observes a route operation with an injectable test observer.
 * @param operation - Bounded operation name.
 * @param effect - Work to measure.
 * @returns Effect with its success and error channels preserved.
 * @example observeRoute("route.define", Effect.succeed(route));
 */
export function observeRoute<A, E, R>(
  operation: RouteOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.withSpan(measureRoute(operation, effect), `routes.${operation}`);
}

/** Records route metrics without creating a second span inside named Effect functions.
 * @param operation - Bounded operation name.
 * @param effect - Work to measure.
 * @returns Effect with its success and error channels preserved.
 * @example measureRoute("route.define", Effect.succeed(route));
 */
export function measureRoute<A, E, R>(
  operation: RouteOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(RouteTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

function observeLive<A, E, R>(
  operation: RouteOperation,
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

/** Evaluates synchronous authoring logic inside a typed and observed Effect.
 * @param operation - Bounded operation name.
 * @param evaluate - Deferred authoring calculation.
 * @returns Result or a tagged invalid-input failure; unexpected defects remain defects.
 * @example routeTry("route.define", () => descriptor);
 */
export function routeTry<A>(
  operation: RouteOperation,
  evaluate: () => A,
): Effect.Effect<A, RouteOperationError> {
  return measureRoute(operation, routeAttempt(operation, evaluate));
}

/** Evaluates a calculation inside an already observed route operation.
 * @param operation - Bounded operation name for typed failures.
 * @param evaluate - Deferred calculation.
 * @returns Result or tagged invalid-input failure.
 * @example yield* routeAttempt("route.define", () => descriptor);
 */
export function routeAttempt<A>(
  operation: RouteOperation,
  evaluate: () => A,
): Effect.Effect<A, RouteOperationError> {
  return Effect.sync(evaluate).pipe(
    Effect.catchDefect((cause) =>
      cause instanceof RouteInputError ||
      cause instanceof StableIdError ||
      cause instanceof DescriptorIdentityError ||
      cause instanceof JsonValueError
        ? Effect.fail(new RouteOperationError({ operation, reason: cause.message, cause }))
        : Effect.die(cause),
    ),
  );
}

/** Acquires an unbound route identity through the caller's IdentityStore Layer.
 * @param operation - Owning route operation.
 * @returns Unbound ID or tagged identity failure.
 * @example yield* routeIdentity("middleware.define");
 */
export function routeIdentity(
  operation: RouteOperation,
): Effect.Effect<string, RouteOperationError> {
  return createUnboundIdentityEffect().pipe(
    Effect.mapError(
      (failure) =>
        new RouteOperationError({
          operation,
          reason: failure.message,
          cause: failure.cause,
        }),
    ),
  );
}

/** Runs a synchronous compatibility API and restores its original error.
 * @param effect - Fully provided route authoring Effect.
 * @returns The successful value.
 * @throws The original validation error or an unexpected defect.
 * @example runRouteSync(Effect.succeed(true));
 */
export function runRouteSync<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const failure = Cause.squash(exit.cause);
  if (failure instanceof RouteOperationError) throw failure.cause;
  throw failure;
}
