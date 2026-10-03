import { Deferred, Effect, Exit, Fiber, Stream } from "effect";
import { observeExecution } from "./operation.js";
import type {
  ExecutionDomain,
  ExecutionTerminalPolicy,
  ExecutionWorkload,
} from "./operation.types.js";

/**
 * Observes a lazy stream from its first pull until consumption finishes.
 * @typeParam A - Stream element.
 * @typeParam E - Expected stream failure.
 * @typeParam R - Required stream services.
 * @param domain - Fixed package owner.
 * @param operation - Declaration-owned operation label.
 * @param stream - Stream whose resources remain owned by its consumer.
 * @param workload - Lazy bounded counts evaluated once at the first pull.
 * @param terminal - Optional domain outcome policy, preserving the original stream cause.
 * @returns A stream preserving elements and causes, with one lifetime observation.
 * @remarks Natural EOF succeeds; early return is interruption. A named lifetime
 * span begins at first pull, independently of the span that created the stream. The observer
 * joins before cleanup completes, so timing covers every pull and finalization.
 * @example
 * ```ts
 * import { Effect, Stream } from "effect";
 * import { observeExecutionStream } from "@relkit/runtime-effect";
 * const source = observeExecutionStream("runtime", "example.consume", Stream.make(1, 2));
 * const values = await Effect.runPromise(Stream.runCollect(source));
 * ```
 */
export function observeExecutionStream<A, E, R>(
  domain: ExecutionDomain,
  operation: string,
  stream: Stream.Stream<A, E, R>,
  workload?: () => ExecutionWorkload,
  terminal?: ExecutionTerminalPolicy<void, E>,
): Stream.Stream<A, E, R> {
  return Stream.unwrap(
    Effect.gen(function* () {
      const completed = yield* Deferred.make<void, E>();
      const started = yield* Deferred.make<void>();
      const observer = yield* observeExecution(
        domain,
        operation,
        Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(completed))),
        workload,
        terminal,
      ).pipe(Effect.ensuring(Deferred.succeed(started, undefined)), Effect.forkScoped);
      // The source cannot finish its first pull before the lifetime metric starts.
      // Finalization also releases this handshake if observation is interrupted.
      yield* Deferred.await(started);
      let drained = false;
      const end = Stream.fromEffect(
        Effect.sync(() => {
          drained = true;
        }),
      ).pipe(Stream.drain);
      return stream.pipe(
        Stream.concat(end),
        Stream.onExit((exit) =>
          Deferred.done(
            completed,
            Exit.isSuccess(exit) && !drained ? Exit.interrupt() : Exit.asVoid(exit),
          ).pipe(Effect.andThen(Fiber.await(observer)), Effect.asVoid),
        ),
      );
    }),
  ).pipe(Stream.withSpan("Execution.stream"));
}
