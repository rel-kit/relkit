import { Clock, Duration, Effect, Exit, Metric, Schema } from "effect";
import { ObservabilityStreamError } from "./stream-types.js";
import { streamUtilsCore } from "./stream-utils-core.js";
/**
 * Tagged invalid, future, or expired cursor failure.
 * @example
 * if (error._tag === "StreamValidationError") console.error(error.code);
 */
export class StreamValidationError extends Schema.TaggedError<StreamValidationError>()(
  "StreamValidationError",
  {
    code: Schema.Literals([
      "RELKIT_OBSERVABILITY_STREAM_INVALID",
      "RELKIT_OBSERVABILITY_STREAM_CURSOR_FUTURE",
      "RELKIT_OBSERVABILITY_STREAM_CURSOR_EXPIRED",
    ]),
    message: Schema.String,
  },
) {}
function observe<A, E>(operation: string, effect: Effect.Effect<A, E>): Effect.Effect<A, E> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        yield* Metric.update(
          Metric.counter("relkit_observability_stream_utilities_total", {
            attributes: { operation, outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_stream_utility_duration", {
            attributes: { operation },
          }),
          Duration.millis((yield* Clock.currentTimeMillis) - started),
        );
      }),
    );
  });
}
function expected<A>(run: () => A): Effect.Effect<A, StreamValidationError> {
  return Effect.try({ try: run, catch: (cause) => cause }).pipe(
    Effect.catch((cause) =>
      cause instanceof ObservabilityStreamError &&
      cause.code !== "RELKIT_OBSERVABILITY_STREAM_CLOSED"
        ? Effect.fail(new StreamValidationError({ code: cause.code, message: cause.message }))
        : Effect.die(cause),
    ),
  );
}
/**
 * Resolves the two compatible cursor fields.
 * @param value - Candidate cursor fields.
 * @returns An Effect with the cursor or a tagged disagreement error.
 * @example
 * const cursor = Effect.runSync(resolveCursorEffect({ cursor: "1" }));
 */
export const resolveCursorEffect = Effect.fn("ObservabilityStream.resolveCursor")(
  (value: { readonly cursor?: string; readonly afterCursor?: string }) =>
    observe(
      "resolveCursor",
      expected(() => streamUtilsCore.resolveCursor(value)),
    ),
);
/**
 * Checks a cursor against the retained stream window.
 * @param value - Decimal cursor text.
 * @param latest - Latest cursor.
 * @param earliest - Earliest retained cursor, if known.
 * @returns Void or a tagged invalid, future, or expired cursor error.
 * @example
 * Effect.runSync(validateCursorEffect("3", 4, "2"));
 */
export const validateCursorEffect = Effect.fn("ObservabilityStream.validateCursor")(
  (value: string, latest: number, earliest?: string) =>
    observe(
      "validateCursor",
      expected(() => streamUtilsCore.validateCursor(value, latest, earliest)),
    ),
);
/**
 * Validates a positive stream bound.
 * @param value - Requested bound.
 * @param name - Field name used in the error message.
 * @returns An Effect with the bound or a tagged validation error.
 * @example
 * const size = Effect.runSync(positiveStreamEffect(8, "queue"));
 */
export const positiveStreamEffect = Effect.fn("ObservabilityStream.positive")(
  (value: number, name: string) =>
    observe(
      "positive",
      expected(() => streamUtilsCore.positive(value, name)),
    ),
);
/**
 * Clamps a valid positive bound to its maximum.
 * @param value - Requested bound.
 * @param maximum - Maximum allowed bound.
 * @param name - Field name used in validation errors.
 * @returns An Effect with the clamped bound or a tagged validation error.
 * @example
 * const size = Effect.runSync(boundedStreamEffect(100, 64, "queue"));
 */
export const boundedStreamEffect = Effect.fn("ObservabilityStream.bounded")(
  (value: number, maximum: number, name: string) =>
    observe(
      "bounded",
      expected(() => streamUtilsCore.bounded(value, maximum, name)),
    ),
);
/**
 * Validates and narrows a stream event type.
 * @param value - Event type text.
 * @returns An Effect with a known event type or tagged validation error.
 * @example
 * const type = Effect.runSync(assertStreamTypeEffect("log.emitted"));
 */
export const assertStreamTypeEffect = Effect.fn("ObservabilityStream.assertType")((value: string) =>
  observe(
    "assertType",
    expected(() => streamUtilsCore.assertType(value)),
  ),
);
/**
 * Constructs the compatible invalid-input error in an observed Effect.
 * @param message - Error text.
 * @returns An Effect with the public stream error value.
 * @example
 * const error = Effect.runSync(invalidStreamErrorEffect("invalid cursor"));
 */
export const invalidStreamErrorEffect = Effect.fn("ObservabilityStream.invalid")(
  (message: string) =>
    observe(
      "invalid",
      Effect.sync(() => streamUtilsCore.invalid(message)),
    ),
);
