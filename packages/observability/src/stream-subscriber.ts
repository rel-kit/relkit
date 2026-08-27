import type {
  ObservabilityStreamEvent,
  ObservabilityStreamOverflow,
  ObservabilityStreamSubscription,
  ObservabilityStreamSubscriptionStats,
} from "./stream-types.js";
import { ObservabilityStreamError } from "./stream-types.js";

export type StreamSubscriber = ObservabilityStreamSubscription & {
  readonly enqueue: (event: ObservabilityStreamEvent) => void;
};
type Waiter = (result: IteratorResult<ObservabilityStreamEvent>) => void;

export function createStreamSubscriber(
  id: string,
  queueSize: number,
  overflow: ObservabilityStreamOverflow,
  remove: () => void,
  onDrop: (count: number) => void,
): StreamSubscriber {
  if (!["drop-oldest", "drop-newest", "disconnect"].includes(overflow))
    throw new ObservabilityStreamError(
      "RELKIT_OBSERVABILITY_STREAM_INVALID",
      "subscriber overflow mode is invalid",
    );
  const queue: ObservabilityStreamEvent[] = [];
  let dropped = 0;
  let cursor = "0";
  let closed = false;
  let waiter: Waiter | undefined;
  const close = (): void => {
    if (closed) return;
    closed = true;
    queue.length = 0;
    remove();
    waiter?.({ value: undefined as never, done: true });
    waiter = undefined;
  };
  const enqueue = (event: ObservabilityStreamEvent): void => {
    if (closed) return;
    if (waiter !== undefined) {
      const resolve = waiter;
      waiter = undefined;
      cursor = event.cursor;
      resolve({ value: event, done: false });
      return;
    }
    if (queue.length < queueSize) return void queue.push(event);
    dropped += 1;
    onDrop(1);
    if (overflow === "disconnect") return close();
    if (overflow === "drop-newest") return;
    queue.shift();
    queue.push(event);
  };
  const next = (): Promise<IteratorResult<ObservabilityStreamEvent>> => {
    if (queue.length > 0) {
      const value = queue.shift()!;
      cursor = value.cursor;
      return Promise.resolve({ value, done: false });
    }
    if (closed) return Promise.resolve({ value: undefined as never, done: true });
    if (waiter !== undefined)
      return Promise.reject(
        new ObservabilityStreamError(
          "RELKIT_OBSERVABILITY_STREAM_INVALID",
          "only one pending subscriber read is supported",
        ),
      );
    return new Promise((resolve) => {
      waiter = resolve;
    });
  };
  const subscription = {
    id,
    next,
    return: async () => {
      close();
      return { value: undefined as never, done: true } as const;
    },
    [Symbol.asyncIterator]() {
      return subscription;
    },
    close,
    dropped: () => dropped,
    stats: (): ObservabilityStreamSubscriptionStats => ({
      queued: queue.length,
      dropped,
      cursor,
      closed,
    }),
    enqueue,
  } as StreamSubscriber;
  return subscription;
}
