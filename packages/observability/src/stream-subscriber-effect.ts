import { Clock, Context, Duration, Effect, Exit, Layer, Metric, Schema } from "effect";
import type { ObservabilityStreamEvent, ObservabilityStreamOverflow } from "./stream-types.js";
import { ObservabilityStreamError } from "./stream-types.js";
import { streamSubscriberCore } from "./stream-subscriber-core.js";
import type { StreamSubscriberEffects } from "./stream-subscriber-effect.types.js";
/**
 * Tagged invalid stream consumer input or concurrent read.
 * @example
 * if (error._tag === "StreamSubscriberError") console.error(error.message);
 */
export class StreamSubscriberError extends Schema.TaggedError<StreamSubscriberError>()(
  "StreamSubscriberError",
  { code: Schema.Literals(["RELKIT_OBSERVABILITY_STREAM_INVALID"]), message: Schema.String },
) {}
/**
 * Substitutable bounded stream consumer for Effect programs.
 * @example
 * const consumer = yield* StreamSubscriberService;
 */
// prettier-ignore
export class StreamSubscriberService extends Context.Service<StreamSubscriberService, StreamSubscriberEffects>()(
  "@relkit/observability/StreamSubscriber",
) {}
function observe<A, E>(
  operation: "create" | "enqueue" | "next" | "close" | "dropped" | "stats",
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_stream_consumer_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_stream_consumer_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
function expected<A>(run: () => A): Effect.Effect<A, StreamSubscriberError> {
  return Effect.try({ try: run, catch: (cause) => cause }).pipe(
    Effect.catch((cause) =>
      cause instanceof ObservabilityStreamError
        ? Effect.fail(
            new StreamSubscriberError({
              code: "RELKIT_OBSERVABILITY_STREAM_INVALID",
              message: cause.message,
            }),
          )
        : Effect.die(cause),
    ),
  );
}
/**
 * Creates one bounded stream consumer with interruptible pending reads.
 * The owner must run `close`; use the Layer for automatic scoped release.
 * @param id - Stable internal consumer identity.
 * @param queueSize - Maximum queued events.
 * @param overflow - Overflow policy.
 * @param remove - Callback removing this consumer from its owner.
 * @param onDrop - Callback for aggregate drop counts.
 * @returns An Effect with consumer operations or tagged policy error.
 * @example
 * const consumer = Effect.runSync(makeStreamSubscriberEffect("consumer-1", 8, "drop-oldest", remove, onDrop));
 */
export const makeStreamSubscriberEffect = Effect.fn("ObservabilityStream.consumer.create")(
  (
    id: string,
    queueSize: number,
    overflow: ObservabilityStreamOverflow,
    remove: () => void,
    onDrop: (count: number) => void,
  ) =>
    Effect.uninterruptible(
      observe(
        "create",
        Effect.gen(function* () {
          const consumer = yield* expected(() =>
            streamSubscriberCore.createStreamSubscriber(id, queueSize, overflow, remove, onDrop),
          );
          const enqueue = Effect.fn("ObservabilityStream.consumer.enqueue")(
            (event: ObservabilityStreamEvent) =>
              observe(
                "enqueue",
                Effect.sync(() => consumer.enqueue(event)),
              ),
          );
          const next = Effect.fn("ObservabilityStream.consumer.next")(() =>
            observe(
              "next",
              Effect.tryPromise({
                try: (signal) => {
                  const abort = () => consumer.close();
                  signal.addEventListener("abort", abort, { once: true });
                  if (signal.aborted) abort();
                  return consumer.next().finally(() => signal.removeEventListener("abort", abort));
                },
                catch: (cause) => cause,
              }).pipe(
                Effect.catch((cause) =>
                  cause instanceof ObservabilityStreamError
                    ? Effect.fail(
                        new StreamSubscriberError({
                          code: "RELKIT_OBSERVABILITY_STREAM_INVALID",
                          message: cause.message,
                        }),
                      )
                    : Effect.die(cause),
                ),
              ),
            ),
          );
          const close = Effect.fn("ObservabilityStream.consumer.close")(() =>
            observe(
              "close",
              Effect.sync(() => consumer.close()),
            ),
          );
          const dropped = Effect.fn("ObservabilityStream.consumer.dropped")(() =>
            observe(
              "dropped",
              Effect.sync(() => consumer.dropped()),
            ),
          );
          const stats = Effect.fn("ObservabilityStream.consumer.stats")(() =>
            observe(
              "stats",
              Effect.sync(() => consumer.stats()),
            ),
          );
          return StreamSubscriberService.of({ id, enqueue, next, close, dropped, stats });
        }),
      ),
    ),
);
/**
 * Provides a consumer that closes when its Effect Scope ends.
 * @param id - Internal consumer identity.
 * @param queueSize - Maximum queued events.
 * @param overflow - Overflow policy.
 * @param remove - Owner removal callback.
 * @param onDrop - Owner drop-count callback.
 * @returns A scoped Layer with StreamSubscriberService.
 * @example
 * const layer = streamSubscriberLayer("consumer-1", 8, "drop-oldest", remove, onDrop);
 */
export function streamSubscriberLayer(
  id: string,
  queueSize: number,
  overflow: ObservabilityStreamOverflow,
  remove: () => void,
  onDrop: (count: number) => void,
) {
  return Layer.effect(
    StreamSubscriberService,
    Effect.acquireRelease(
      makeStreamSubscriberEffect(id, queueSize, overflow, remove, onDrop),
      (consumer) => consumer.close(),
    ),
  );
}
