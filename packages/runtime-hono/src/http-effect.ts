import { Cause, Effect, Exit, Schema, Stream } from "effect";
import { observeExecution, withNativeEffectContext } from "@relkit/runtime-effect";
import { currentHttpContext } from "./http-logging.js";

/** A recoverable failure at a native HTTP integration boundary. */
export class HttpBoundaryError extends Schema.TaggedError<HttpBoundaryError>()(
  "HttpBoundaryError",
  { operation: Schema.String, cause: Schema.Unknown },
) {}

/** Suspend a native integration until its owning Effect executes.
 * @typeParam A - Native integration success value.
 * @param operation - Bounded declaration-owned operation name.
 * @param execute - Native integration; receives the owning fiber's abort signal.
 * @returns A lazy effect retaining the original failure for compatibility adapters.
 */
export function httpBoundary<A>(
  operation: string,
  execute: (signal: AbortSignal) => PromiseLike<A>,
): Effect.Effect<A, HttpBoundaryError> {
  return Effect.withFiber((fiber) =>
    Effect.tryPromise({
      try: (signal) => withNativeEffectContext(fiber.context, () => execute(signal)),
      catch: (cause) => new HttpBoundaryError({ operation, cause }),
    }),
  );
}

/** Observe a complete HTTP domain operation independently of its transport adapter.
 * @typeParam A - Operation success value.
 * @typeParam E - Recoverable operation failure.
 * @typeParam R - Services required by the operation.
 * @param operation - Bounded declaration-owned operation name.
 * @param effect - Lazy domain workflow.
 * @returns The workflow with shared execution instrumentation.
 */
export function observeHttp<A, E, R>(operation: string, effect: Effect.Effect<A, E, R>) {
  return observeExecution("http", operation, effect);
}

/** Execute an HTTP compatibility boundary while retaining existing thrown errors.
 * @typeParam A - Successful public result.
 * @typeParam E - Internal recoverable failure.
 * @param effect - Fully provided operation.
 * @param signal - Optional request cancellation authority.
 * @returns A promise resolving the operation result or rejecting with the native cause.
 * @remarks Only transport/compatibility adapters call this function; services compose Effects.
 */
export async function runHttp<A, E>(effect: Effect.Effect<A, E>, signal?: AbortSignal): Promise<A> {
  const configured = Effect.provide(effect, currentHttpContext());
  const exit = await Effect.runPromiseExit(
    configured,
    signal === undefined ? undefined : { signal },
  );
  if (Exit.isSuccess(exit)) return exit.value;
  const cause = Cause.squash(exit.cause);
  throw cause instanceof HttpBoundaryError ? cause.cause : cause;
}

/** Adapts an Effect stream at the framework boundary and captures the request's services.
 * @typeParam A - Stream element delivered to the transport.
 * @typeParam E - Recoverable stream failure.
 * @param stream - Lazy stream whose resources remain owned until return, failure or EOF.
 * @returns An async iterable preserving native public errors and request logger context.
 * @remarks Each iterator acquires its own scope; returning closes owned upstream resources.
 */
export function httpIterable<A, E>(stream: Stream.Stream<A, E>): AsyncIterableIterator<A> {
  const iterable = Stream.toAsyncIterable(
    stream.pipe(
      Stream.mapError((error) => (error instanceof HttpBoundaryError ? error.cause : error)),
      Stream.provide(currentHttpContext()),
    ),
  );
  // oRPC detects next/return as well as the symbol. Delegate return immediately:
  // async-generator delegation would queue it behind a blocked native next call.
  const iterator = iterable[Symbol.asyncIterator]();
  return {
    next: (value) => iterator.next(value),
    return: (value) => iterator.return?.(value) ?? Promise.resolve({ done: true, value }),
    throw: (error) => iterator.throw?.(error) ?? Promise.reject(error),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
