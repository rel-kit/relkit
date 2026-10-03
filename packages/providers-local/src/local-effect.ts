import { Cause, Context, Effect, Exit, Logger, Schema } from "effect";
import {
  currentNativeEffectContext,
  observeExecution,
  withNativeEffectContext,
} from "@relkit/runtime-effect";

/** Legacy provider constructors expose no logger option; keep their boundary quiet. */
const boundaryLogger = Context.make(Logger.CurrentLoggers, new Set());

/** Retains explicit caller configuration while keeping default Promise adapters quiet.
 * @returns The caller context with explicit logger settings, or quiet defaults.
 */
function boundaryContext() {
  const context = currentNativeEffectContext();
  if (context === undefined) return boundaryLogger;
  if (context.mapUnsafe.has(Logger.CurrentLoggers.key)) return context;
  return Context.merge(boundaryLogger, context);
}

/** Internal provider failure retaining the original public boundary error. */
export class LocalOperationError extends Schema.TaggedError<LocalOperationError>()(
  "LocalOperationError",
  { cause: Schema.Unknown },
) {}

/**
 * Captures an expected synchronous provider failure in the typed channel.
 * @param evaluate - Validation or atomic state calculation.
 * @returns A lazy calculation retaining the original error identity.
 * @typeParam A - Successful result.
 */
export function localSync<A>(evaluate: () => A): Effect.Effect<A, LocalOperationError> {
  return Effect.withFiber((fiber) =>
    Effect.try({
      try: () => withNativeEffectContext(fiber.context, evaluate),
      catch: (cause) => new LocalOperationError({ cause }),
    }),
  );
}

/**
 * Adapts a native Promise boundary with an interruption signal.
 * @param evaluate - Native operation; forward the signal when supported.
 * @returns A lazy, interruptible native operation with a typed failure.
 * @typeParam A - Successful result.
 */
export function localPromise<A>(
  evaluate: (signal: AbortSignal) => PromiseLike<A>,
): Effect.Effect<A, LocalOperationError> {
  return Effect.withFiber((fiber) =>
    Effect.tryPromise({
      try: (signal) => withNativeEffectContext(fiber.context, () => evaluate(signal)),
      catch: (cause) => new LocalOperationError({ cause }),
    }),
  );
}

/**
 * Instruments the owner of a local operation using a bounded declaration label.
 * @param operation - Static operation name; never include keys or payloads.
 * @param effect - Lazy operation with its existing dependencies and failures.
 * @param workload - Bounded counters computed at execution, without user keys or payloads.
 * @returns The same operation with outcome, duration and structured logging.
 * @typeParam A - Success value.
 * @typeParam E - Typed failures.
 * @typeParam R - Required services.
 */
export function localOperation<A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
  workload?: () => Readonly<Record<string, number>>,
): Effect.Effect<A, E, R> {
  return observeExecution("local", operation, effect, workload);
}

/**
 * Executes a compatibility Promise boundary without changing public errors.
 * @param effect - Fully provisioned owning operation.
 * @param signal - Optional caller cancellation propagated to the fiber.
 * @returns The operation result or the original public error.
 * @typeParam A - Success value.
 */
export async function runLocal<A>(
  effect: Effect.Effect<A, LocalOperationError>,
  signal?: AbortSignal,
): Promise<A> {
  const configured = Effect.provide(effect, boundaryContext());
  const exit = await Effect.runPromiseExit(
    configured,
    signal === undefined ? undefined : { signal },
  );
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.squash(exit.cause);
  throw error instanceof LocalOperationError ? error.cause : error;
}

/**
 * Executes a synchronously completable compatibility operation.
 * @param effect - Validation or construction without asynchronous acquisition.
 * @returns The result, preserving the original public exception identity.
 * @typeParam A - Success value.
 */
export function runLocalSync<A>(effect: Effect.Effect<A, LocalOperationError>): A {
  const exit = Effect.runSyncExit(Effect.provide(effect, boundaryContext()));
  if (Exit.isSuccess(exit)) return exit.value;
  const error = Cause.squash(exit.cause);
  throw error instanceof LocalOperationError ? error.cause : error;
}
