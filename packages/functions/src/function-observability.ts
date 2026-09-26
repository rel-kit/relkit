import { StableIdError } from "@relkit/contracts";
import { DescriptorIdentityError } from "@relkit/invocation";
import { Cause, Clock, Context, Effect, Exit, Layer, Metric, Option, Schema } from "effect";
import { FunctionInputError } from "./function-input-error.js";
import type {
  FunctionOperation,
  FunctionTelemetryService,
} from "./function-observability.types.js";
import {
  FunctionToolApprovalDeniedFailure,
  FunctionToolApprovalRequiredFailure,
  FunctionToolArgumentFailure,
  FunctionToolCancelledFailure,
} from "./function-tool-failures.js";

export type {
  FunctionOperation,
  FunctionTelemetryService,
} from "./function-observability.types.js";

/** Tagged failure of a function authoring operation.
 * @example const error = new FunctionOperationError({ operation: "stream.create", cause: new TypeError("Invalid item") });
 */
export class FunctionOperationError extends Schema.TaggedError<FunctionOperationError>()(
  "FunctionOperationError",
  { operation: Schema.String, reason: Schema.optionalKey(Schema.String), cause: Schema.Defect() },
) {}

/** Replaceable telemetry service for operation spans and metrics.
 * @example Effect.provide(streamOfEffect(schema), FunctionTelemetryLive);
 */
export class FunctionTelemetry extends Context.Service<
  FunctionTelemetry,
  FunctionTelemetryService
>()("relkit/functions/FunctionTelemetry") {}

const operations = Metric.counter("relkit_function_operations_total", { incremental: true });
const failures = Metric.counter("relkit_function_failures_total", { incremental: true });
const duration = Metric.histogram("relkit_function_duration_ms", {
  boundaries: [0.01, 0.1, 1, 5, 10, 50, 100],
});

/** Default telemetry layer for function operations.
 * @example Effect.runSync(Effect.provide(Effect.void, FunctionTelemetryLive));
 */
export const FunctionTelemetryLive = Layer.succeed(FunctionTelemetry, { observe: observeLive });

/** Measures an operation using the provided telemetry service or the live observer.
 * @param operation - Fixed operation name.
 * @param effect - Work to measure.
 * @returns Effect with the original success and failure channels.
 * @example observeFunction("stream.is-output", Effect.succeed(true));
 */
export function observeFunction<A, E, R>(
  operation: FunctionOperation,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.flatMap(Effect.serviceOption(FunctionTelemetry), (service) =>
    Option.isSome(service)
      ? service.value.observe(operation, effect)
      : observeLive(operation, effect),
  );
}

function observeLive<A, E, R>(
  operation: FunctionOperation,
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
  return Effect.withSpan(measured, `functions.${operation}`);
}

/** Executes a synchronous compatibility adapter and restores its original error.
 * @param effect - Fully provided Effect operation.
 * @returns Successful value.
 * @throws The original validation error or an unexpected defect.
 * @example runFunctionSync(Effect.succeed(1));
 */
export function runFunctionSync<A, E>(effect: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const failure = Cause.squash(exit.cause);
  if (failure instanceof FunctionOperationError) throw failure.cause;
  if (isFunctionToolFailure(failure)) throw failure.cause;
  throw failure;
}

/** Executes an asynchronous compatibility adapter and restores its original error.
 * @param effect - Fully provided Effect operation.
 * @returns Promise of the successful value.
 * @throws The original domain error or an unexpected defect.
 * @example await runFunctionPromise(Effect.succeed(1));
 */
export async function runFunctionPromise<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const failure = Cause.squash(exit.cause);
  if (failure instanceof FunctionOperationError) throw failure.cause;
  if (isFunctionToolFailure(failure)) throw failure.cause;
  throw failure;
}

function isFunctionToolFailure(
  failure: unknown,
): failure is
  | FunctionToolArgumentFailure
  | FunctionToolCancelledFailure
  | FunctionToolApprovalRequiredFailure
  | FunctionToolApprovalDeniedFailure {
  return (
    failure instanceof FunctionToolArgumentFailure ||
    failure instanceof FunctionToolCancelledFailure ||
    failure instanceof FunctionToolApprovalRequiredFailure ||
    failure instanceof FunctionToolApprovalDeniedFailure
  );
}

/** Maps an expected input error into the tagged channel and preserves defects.
 * @param operation - Fixed operation name.
 * @param evaluate - Calculation performed at Effect execution time.
 * @returns Effect with a tagged failure for marked input errors.
 * @example runFunctionSync(functionTry("stream.is-output", () => true));
 */
export function functionTry<A>(
  operation: FunctionOperation,
  evaluate: () => A,
): Effect.Effect<A, FunctionOperationError> {
  return observeFunction(operation, functionAttempt(operation, evaluate));
}

/** Evaluates a synchronous step within an already observed operation.
 * @param operation - Fixed operation name for a typed failure.
 * @param evaluate - Calculation performed at Effect execution time.
 * @returns Effect with a tagged failure for expected input errors.
 * @example yield* functionAttempt("error.define", () => validateInput(input));
 */
export function functionAttempt<A>(
  operation: FunctionOperation,
  evaluate: () => A,
): Effect.Effect<A, FunctionOperationError> {
  return Effect.sync(evaluate).pipe(
    Effect.catchDefect((cause) =>
      cause instanceof FunctionInputError ||
      cause instanceof StableIdError ||
      cause instanceof DescriptorIdentityError
        ? Effect.fail(new FunctionOperationError({ operation, reason: cause.message, cause }))
        : Effect.die(cause),
    ),
  );
}
