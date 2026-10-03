import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option } from "effect";
import type {
  InvocationOperation,
  InvocationTelemetryService,
} from "./invocation-observability.types.js";

export type {
  InvocationOperation,
  InvocationTelemetryService,
} from "./invocation-observability.types.js";

/** Substitutable telemetry for invocation operations.
 * @example Effect.provide(normalizeErrorRetryEffect("later"), InvocationTelemetryLive);
 */
export class InvocationTelemetry extends Context.Service<
  InvocationTelemetry,
  InvocationTelemetryService
>()("relkit/invocation/InvocationTelemetry") {}

/** Live span and metric observer for invocation operations.
 * @example Effect.runSync(Effect.provide(normalizeErrorRetryEffect("never"), InvocationTelemetryLive));
 */
export const InvocationTelemetryLive = Layer.succeed(InvocationTelemetry, { observe: observeLive });

// Operation names are a closed declaration-owned union. Reuse immutable metric
// handles so Effect can cache hooks per registry; never retain a caller context.
const operationMetrics = new Map<InvocationOperation, ReturnType<typeof createOperationMetrics>>();

/** Builds metric handles for one bounded invocation operation.
 * @param operation - Declaration-owned operation name.
 * @returns Handles whose contextual registry and attributes resolve at execution.
 */
function createOperationMetrics(operation: InvocationOperation) {
  const attributes = { operation };
  return {
    calls: Metric.counter("relkit_invocation_operations_total", { incremental: true, attributes }),
    failures: Metric.counter("relkit_invocation_failures_total", { incremental: true, attributes }),
    duration: Metric.histogram("relkit_invocation_duration_ms", {
      boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
      attributes,
    }),
  };
}

/** Updates a cached handle while retaining declaration-owned label precedence.
 * @typeParam Input - Metric input value.
 * @typeParam State - Metric snapshot state.
 * @param metric - Immutable handle with an intrinsic operation label.
 * @param input - Counter increment or measured duration.
 * @param operation - Bounded label that overrides a colliding caller attribute.
 * @returns Lazy mutation in the caller's registry, without changing workflow attributes.
 */
function updateOperationMetric<Input, State>(
  metric: Metric.Metric<Input, State>,
  input: Input,
  operation: InvocationOperation,
): Effect.Effect<void> {
  return Effect.withFiber((fiber) => {
    const attributes = Context.get(fiber.context, Metric.CurrentMetricAttributes);
    const context = Object.hasOwn(attributes, "operation")
      ? Context.add(fiber.context, Metric.CurrentMetricAttributes, { ...attributes, operation })
      : fiber.context;
    metric.updateUnsafe(input, context);
    return Effect.void;
  });
}

/** Retains the instrumentation stack boundary without redefining it per operation.
 * @typeParam A - Successful operation value.
 * @typeParam E - Typed operation failure.
 * @typeParam R - Required operation dependencies.
 * @param effect - Lazy operation carrying the original result and failure channels.
 * @returns The same operation under the shared instrumentation stack frame.
 * @remarks The owning observer supplies the operation span; this helper adds no span.
 */
const executeObserved = Effect.fn(function* <A, E, R>(effect: Effect.Effect<A, E, R>) {
  return yield* effect;
});

/** Observes an operation with a fixed span and bounded metric labels.
 * @param operation - Fixed operation name.
 * @param effect - Operation to observe.
 * @returns The original Effect success and error channels.
 * @example observeInvocation("retry.normalize", Effect.succeed({ retry: "never" }));
 */
export function observeInvocation<A, E, R>(
  operation: InvocationOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(InvocationTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, executeObserved(effect))
      : observeLive(operation, executeObserved(effect)),
  );
}

function observeLive<A, E, R>(
  operation: InvocationOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const metrics = operationMetrics.get(operation) ?? createOperationMetrics(operation);
  operationMetrics.set(operation, metrics);
  const measured = Effect.gen(function* () {
    const started = yield* Clock.monotonicTimeNanos;
    yield* updateOperationMetric(metrics.calls, 1, operation);
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const elapsed = Number((yield* Clock.monotonicTimeNanos) - started) / 1_000_000;
        yield* updateOperationMetric(metrics.duration, Math.max(0, elapsed), operation);
        if (Exit.isFailure(exit)) yield* updateOperationMetric(metrics.failures, 1, operation);
      }),
    );
  });
  return Effect.flatMap(Effect.option(Effect.currentSpan), (current) =>
    Option.isSome(current) && Reflect.get(current.value, "relkitInvocationSpan") === true
      ? measured
      : Effect.withSpan(measured, `invocation.${operation}`),
  );
}

/** Runs a synchronous compatibility adapter while preserving its failure.
 * @param effect - Effect operation with all dependencies available.
 * @returns The successful value.
 * @throws The typed domain failure or an unexpected defect.
 * @example runInvocationSync(Effect.succeed(1));
 */
export function runInvocationSync<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
