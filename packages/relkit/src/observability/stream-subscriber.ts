import { Effect } from "effect";
import type { ObservabilityStreamOverflow } from "./stream-types.js";
import { ObservabilityStreamError } from "./stream-types.js";
import type { StreamSubscriber } from "./stream-subscriber.types.js";
import { makeStreamSubscriberEffect } from "./stream-subscriber-effect.js";
export type { StreamSubscriber } from "./stream-subscriber.types.js";
export {
  StreamSubscriberError,
  StreamSubscriberService,
  makeStreamSubscriberEffect,
  streamSubscriberLayer,
} from "./stream-subscriber-effect.js";
/**
 * Creates one bounded stream subscriber compatibility handle.
 * Close the handle when its consumer is finished; the Effect Layer can own
 * this release automatically for Effect programs.
 * @param id - Internal subscriber identity.
 * @param queueSize - Maximum queued events.
 * @param overflow - Overflow policy.
 * @param remove - Owner removal callback.
 * @param onDrop - Owner drop-count callback.
 * @returns A subscriber with async reads and synchronous queue operations.
 * @throws {ObservabilityStreamError} If overflow policy is invalid.
 * @example
 * const subscriber = createStreamSubscriber("one", 8, "drop-oldest", remove, onDrop);
 * subscriber.close();
 */
export function createStreamSubscriber(
  id: string,
  queueSize: number,
  overflow: ObservabilityStreamOverflow,
  remove: () => void,
  onDrop: (count: number) => void,
): StreamSubscriber {
  const consumer = Effect.runSync(
    makeStreamSubscriberEffect(id, queueSize, overflow, remove, onDrop).pipe(
      Effect.mapError((error) => new ObservabilityStreamError(error.code, error.message)),
    ),
  );
  const result: StreamSubscriber = {
    id: consumer.id,
    enqueue: (event) => Effect.runSync(consumer.enqueue(event)),
    next: () =>
      Effect.runPromise(
        consumer
          .next()
          .pipe(
            Effect.mapError((error) => new ObservabilityStreamError(error.code, error.message)),
          ),
      ),
    close: () => Effect.runSync(consumer.close()),
    dropped: () => Effect.runSync(consumer.dropped()),
    stats: () => Effect.runSync(consumer.stats()),
    return: async () => {
      Effect.runSync(consumer.close());
      return { value: undefined as never, done: true } as const;
    },
    [Symbol.asyncIterator]() {
      return result;
    },
  };
  return result;
}
