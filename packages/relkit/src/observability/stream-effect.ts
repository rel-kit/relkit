import { Clock, Context, Duration, Effect, Exit, Layer, Metric, Schema } from "effect";
import type { ObservabilityRecord } from "./model.js";
import type {
  ObservabilityStream,
  ObservabilityStreamEventType,
  ObservabilityStreamInput,
  ObservabilityStreamOptions,
  ObservabilityStreamReplayOptions,
} from "./stream.types.js";
import { ObservabilityStreamError } from "./stream-types.js";
import { streamCore } from "./stream-core.js";
import type { ObservabilityStreamEffects } from "./stream-effect.types.js";
/**
 * Tagged stream operation or redaction failure.
 * @example
 * if (error._tag === "StreamOperationError") console.error(error.message);
 */
export class StreamOperationError extends Schema.TaggedError<StreamOperationError>()(
  "StreamOperationError",
  {
    kind: Schema.Literals(["stream", "redaction"]),
    code: Schema.optionalKey(
      Schema.Literals([
        "RELKIT_OBSERVABILITY_STREAM_INVALID",
        "RELKIT_OBSERVABILITY_STREAM_CURSOR_EXPIRED",
        "RELKIT_OBSERVABILITY_STREAM_CURSOR_FUTURE",
        "RELKIT_OBSERVABILITY_STREAM_CLOSED",
      ]),
    ),
    message: Schema.String,
  },
) {}
/**
 * Substitutable bounded stream for Effect programs.
 * @example
 * const stream = yield* ObservabilityStreamService;
 */
// prettier-ignore
export class ObservabilityStreamService extends Context.Service<ObservabilityStreamService, ObservabilityStreamEffects>()(
  "@relkit/observability/Stream",
) {}
function observe<A, E>(operation: string, effect: Effect.Effect<A, E>): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_stream_operations_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_stream_operation_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
function expected<A>(run: () => A): Effect.Effect<A, StreamOperationError> {
  return Effect.try({ try: run, catch: (cause) => cause }).pipe(
    Effect.catch((cause) =>
      cause instanceof ObservabilityStreamError
        ? Effect.fail(
            new StreamOperationError({ kind: "stream", code: cause.code, message: cause.message }),
          )
        : cause instanceof TypeError
          ? Effect.fail(new StreamOperationError({ kind: "redaction", message: cause.message }))
          : Effect.die(cause),
    ),
  );
}
/**
 * Creates a bounded stream with all public operations exposed as Effects.
 * The owner must run `close`; use the Layer for automatic scoped release.
 * @param options - Retention, consumer, overflow, and redaction settings.
 * @returns An Effect with stream operations or tagged configuration failure.
 * @example
 * const stream = Effect.runSync(makeObservabilityStreamEffect({ maxEvents: 100 }));
 */
export const makeObservabilityStreamEffect = Effect.fn("ObservabilityStream.create")(
  (options: ObservabilityStreamOptions = {}) =>
    Effect.uninterruptible(
      observe(
        "create",
        Effect.gen(function* () {
          const raw = yield* expected(() => streamCore.createObservabilityStream(options));
          const publish = Effect.fn("ObservabilityStream.publish")(
            (input: ObservabilityStreamInput) =>
              observe(
                "publish",
                expected(() => raw.publish(input)),
              ),
          );
          const publishRecord = Effect.fn("ObservabilityStream.publishRecord")(
            (type: ObservabilityStreamEventType, record: ObservabilityRecord) =>
              observe(
                "publishRecord",
                expected(() => raw.publishRecord(type, record)),
              ),
          );
          const replay = Effect.fn("ObservabilityStream.replay")(
            (value?: ObservabilityStreamReplayOptions | string, limit?: number) =>
              observe(
                "replay",
                expected(() =>
                  typeof value === "string" || value === undefined
                    ? raw.replay(value, limit)
                    : raw.replay(value),
                ),
              ),
          );
          const subscribe = Effect.fn("ObservabilityStream.subscribe")(
            (input: NonNullable<Parameters<ObservabilityStream["subscribe"]>[0]> = {}) =>
              observe(
                "subscribe",
                expected(() => raw.subscribe(input)),
              ),
          );
          const dropped = Effect.fn("ObservabilityStream.dropped")(() =>
            observe(
              "dropped",
              Effect.sync(() => raw.dropped()),
            ),
          );
          const counters = Effect.fn("ObservabilityStream.counters")(() =>
            observe(
              "counters",
              Effect.sync(() => raw.counters()),
            ),
          );
          const stats = Effect.fn("ObservabilityStream.stats")(() =>
            observe(
              "stats",
              Effect.sync(() => raw.stats()),
            ),
          );
          const close = Effect.fn("ObservabilityStream.close")(() =>
            observe(
              "close",
              Effect.sync(() => raw.close()),
            ),
          );
          return ObservabilityStreamService.of({
            publish,
            publishRecord,
            replay,
            subscribe,
            dropped,
            counters,
            stats,
            close,
          });
        }),
      ),
    ),
);
/**
 * Provides a stream that closes all consumers when its Effect Scope ends.
 * @param options - Retention, queue, and redaction settings.
 * @returns A scoped Layer with ObservabilityStreamService.
 * @example
 * const program = Effect.gen(function* () { return yield* ObservabilityStreamService; });
 * const layer = observabilityStreamLayer({ maxEvents: 100 });
 */
export function observabilityStreamLayer(options: ObservabilityStreamOptions = {}) {
  return Layer.effect(
    ObservabilityStreamService,
    Effect.acquireRelease(makeObservabilityStreamEffect(options), (stream) => stream.close()),
  );
}
