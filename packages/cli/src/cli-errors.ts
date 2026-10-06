import { Effect, Schema } from "effect";

/** A native adapter failure retaining the original cause and public error message. */
export class CliAdapterError extends Schema.TaggedError<CliAdapterError>()("CliAdapterError", {
  operation: Schema.String,
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

/** A CLI usage or product failure with its established public code and exit status. */
export class CliFailureError extends Schema.TaggedError<CliFailureError>()("CliFailureError", {
  code: Schema.String,
  message: Schema.String,
  exitCode: Schema.Number,
  signal: Schema.optionalKey(Schema.Literals(["SIGINT", "SIGTERM"])),
}) {}

/**
 * Lifts one throwing native or library call into the typed adapter failure channel.
 * @typeParam A - The adapter's successful result.
 * @param operation - Declaration-owned boundary label.
 * @param run - Native operation evaluated only when the effect executes.
 * @returns A lazy typed adapter operation; defects from Effect workflows stay defects.
 */
export function cliTry<A>(operation: string, run: () => A): Effect.Effect<A, CliAdapterError> {
  return Effect.try({ try: run, catch: (cause) => cliAdapterError(operation, cause) });
}

/**
 * Lifts one asynchronous native call and supplies its cancellation signal.
 * @typeParam A - The adapter's successful result.
 * @param operation - Declaration-owned native boundary label.
 * @param run - External API call; cancellable APIs must consume the supplied signal.
 * @returns A lazy typed adapter operation, interrupted with its owning fiber.
 * @remarks This helper is for adapter calls, not entire CLI workflows.
 */
export function cliPromise<A>(
  operation: string,
  run: (signal: AbortSignal) => PromiseLike<A>,
): Effect.Effect<A, CliAdapterError> {
  return Effect.tryPromise({ try: run, catch: (cause) => cliAdapterError(operation, cause) });
}

/**
 * Retains the native failure's message without serializing private payloads.
 * @param operation - Declaration-owned boundary label.
 * @param cause - Original native rejection or thrown value.
 * @returns The typed adapter failure.
 */
export function cliAdapterError(operation: string, cause: unknown): CliAdapterError {
  return new CliAdapterError({
    operation,
    cause,
    message: cause instanceof Error ? cause.message : String(cause),
  });
}

/**
 * Restores a native failure at an established public compatibility boundary.
 * @param error - Typed adapter error, product error, or defect.
 * @returns The original adapter rejection, preserving identity and existing public codes.
 */
export function cliOriginalError(error: unknown): unknown {
  return error instanceof CliAdapterError ? cliOriginalError(error.cause) : error;
}

/**
 * Lifts synchronous CLI validation while retaining unexpected defects as defects.
 * @typeParam A - Validated value.
 * @param run - Pure parser or product validation that declares CliFailureError.
 * @returns A lazy domain validation; undeclared throws are never normalized as expected failures.
 */
export function cliValidation<A>(run: () => A): Effect.Effect<A, CliFailureError> {
  return Effect.try({ try: run, catch: (cause) => cause }).pipe(
    Effect.catch((cause) =>
      cause instanceof CliFailureError ? Effect.fail(cause) : Effect.die(cause),
    ),
  );
}
