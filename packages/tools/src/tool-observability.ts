import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option, Schema } from "effect";
import type { ToolOperation, ToolTelemetryService } from "./tool-observability.types.js";
import {
  ToolArgumentsFailure,
  ToolCancelledFailure,
  ToolEngineFailure,
  ToolNotAllowedFailure,
  ToolUnknownFailure,
} from "./runtime-errors.js";

export type { ToolOperation, ToolTelemetryService } from "./tool-observability.types.js";

/** Expected tool input or authoring failure with the original adapter error.
 * @example Effect.catchTag(defineToolEffect(options), "ToolOperationFailure", () => Effect.void);
 */
export class ToolOperationFailure extends Schema.TaggedError<ToolOperationFailure>()(
  "ToolOperationFailure",
  { operation: Schema.String, reason: Schema.String, cause: Schema.Defect() },
) {}

/** Replaceable telemetry boundary for all tool operations.
 * @example Effect.provide(defineToolEffect(options), ToolTelemetryLive);
 */
export class ToolTelemetry extends Context.Service<ToolTelemetry, ToolTelemetryService>()(
  "relkit/tools/ToolTelemetry",
) {}

const operations = Metric.counter("relkit_tool_operations_total", { incremental: true });
const failures = Metric.counter("relkit_tool_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_tool_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Live Effect metric and span observer.
 * @example Effect.runSync(Effect.provide(Effect.void, ToolTelemetryLive));
 */
export const ToolTelemetryLive = Layer.succeed(ToolTelemetry, { observe: observeLive });

/** Adds bounded operation telemetry while preserving the original channels.
 * @param operation - Stable operation name.
 * @param effect - Work to observe.
 * @returns The same success and error channels with metrics and a span.
 * @example observeTool("is-ref", Effect.succeed(true));
 */
export function observeTool<A, E, R>(
  operation: ToolOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(ToolTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

function observeLive<A, E, R>(
  operation: ToolOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const attributes = { operation };
  const measured = Effect.gen(function* () {
    const started = yield* Clock.monotonicTimeNanos;
    yield* Metric.update(Metric.withAttributes(operations, attributes), 1);
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const elapsed = Number((yield* Clock.monotonicTimeNanos) - started) / 1_000_000;
        yield* Metric.update(Metric.withAttributes(duration, attributes), Math.max(0, elapsed));
        if (Exit.isFailure(exit))
          yield* Metric.update(Metric.withAttributes(failures, attributes), 1);
      }),
    );
  });
  return Effect.withSpan(measured, `tools.${operation}`);
}

/** Runs a synchronous compatibility adapter and restores its original error.
 * @param effect - Fully provided synchronous operation.
 * @returns Successful value.
 * @throws The original input error or an unexpected defect.
 * @example runToolSync(Effect.succeed(1));
 */
export function runToolSync<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.squash(exit.cause);
  if (hasCompatibilityCause(error)) throw error.cause;
  throw error;
}

/** Runs a Promise compatibility adapter and restores its original error.
 * @param effect - Fully provided asynchronous operation.
 * @returns Successful value.
 * @throws The original input error or an unexpected defect.
 * @example await runToolPromise(Effect.succeed(1));
 */
export async function runToolPromise<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.squash(exit.cause);
  if (hasCompatibilityCause(error)) throw error.cause;
  throw error;
}

function hasCompatibilityCause(
  error: unknown,
): error is
  | ToolOperationFailure
  | ToolUnknownFailure
  | ToolNotAllowedFailure
  | ToolArgumentsFailure
  | ToolCancelledFailure
  | ToolEngineFailure {
  return (
    error instanceof ToolOperationFailure ||
    error instanceof ToolUnknownFailure ||
    error instanceof ToolNotAllowedFailure ||
    error instanceof ToolArgumentsFailure ||
    error instanceof ToolCancelledFailure ||
    error instanceof ToolEngineFailure
  );
}

/** Captures a marked validation error from a synchronous calculation.
 * @param operation - Fixed operation name.
 * @param evaluate - Calculation deferred until Effect execution.
 * @returns Value or a tagged operation failure.
 * @example Effect.runSync(toolTry("required-text", () => "ok"));
 */
export function toolTry<A>(
  operation: ToolOperation,
  evaluate: () => A,
): Effect.Effect<A, ToolOperationFailure> {
  return observeTool(operation, toolAttempt(operation, evaluate));
}

/** Evaluates a step within an already observed operation.
 * @param operation - Fixed operation name for an expected failure.
 * @param evaluate - Deferred calculation.
 * @returns Value or tagged input failure; other defects remain defects.
 * @example yield* toolAttempt("define", () => descriptor);
 */
export function toolAttempt<A>(
  operation: ToolOperation,
  evaluate: () => A,
): Effect.Effect<A, ToolOperationFailure> {
  return Effect.sync(evaluate).pipe(
    Effect.catchDefect((cause) =>
      cause instanceof TypeError
        ? Effect.fail(new ToolOperationFailure({ operation, reason: cause.message, cause }))
        : Effect.die(cause),
    ),
  );
}
