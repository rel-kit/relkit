import type { Effect } from "effect";
import type { ObservabilityStreamEvent, ObservabilityStream } from "./stream.types.js";
import type { StreamSubscriberError } from "./stream-subscriber-effect.js";
/**
 * Effect operations for one bounded stream consumer.
 * A scope owner must run `close` when it no longer uses the consumer.
 * @example
 * const result = yield* consumer.next();
 */
export interface StreamSubscriberEffects {
  readonly id: string;
  readonly enqueue: (event: ObservabilityStreamEvent) => Effect.Effect<void>;
  readonly next: () => Effect.Effect<
    IteratorResult<ObservabilityStreamEvent>,
    StreamSubscriberError
  >;
  readonly close: () => Effect.Effect<void>;
  readonly dropped: () => Effect.Effect<number>;
  readonly stats: () => Effect.Effect<
    ReturnType<ReturnType<ObservabilityStream["subscribe"]>["stats"]>
  >;
}
