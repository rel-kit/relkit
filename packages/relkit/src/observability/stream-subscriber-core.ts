import type {
  ObservabilityStreamEvent,
  ObservabilityStreamOverflow,
  ObservabilityStream,
} from "./stream-types.js";
import { ObservabilityStreamError } from "./stream-types.js";
import type { StreamSubscriber, StreamWaiter } from "./stream-subscriber.types.js";
import { makeStreamBudget, type StreamBudget } from "./stream-budget.js";
import { makeSubscriberQueue } from "./stream-subscriber-queue.js";
function createStreamSubscriber(
  id: string,
  queueSize: number,
  overflow: ObservabilityStreamOverflow,
  remove: () => void,
  onDrop: (count: number) => void,
  budget: StreamBudget = makeStreamBudget(),
): StreamSubscriber {
  if (!["drop-oldest", "drop-newest", "disconnect"].includes(overflow))
    throw new ObservabilityStreamError(
      "RELKIT_OBSERVABILITY_STREAM_INVALID",
      "subscriber overflow mode is invalid",
    );
  let dropped = 0;
  const queue = makeSubscriberQueue(queueSize, overflow, budget, () => {
    dropped++;
    onDrop(1);
  });
  let cursor = "0";
  let closed = false;
  let waiter: StreamWaiter | undefined;
  const close = (): void => {
    if (closed) return;
    closed = true;
    queue.clear();
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
    if (!queue.put(event)) close();
  };
  const next = (): Promise<IteratorResult<ObservabilityStreamEvent>> => {
    if (queue.length() > 0) {
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
  const consumer = {
    id,
    next,
    return: async () => {
      close();
      return { value: undefined as never, done: true } as const;
    },
    [Symbol.asyncIterator]() {
      return consumer;
    },
    close,
    dropped: () => dropped,
    stats: (): ReturnType<ReturnType<ObservabilityStream["subscribe"]>["stats"]> => ({
      queued: queue.length(),
      queuedBytes: queue.bytes(),
      dropped,
      cursor,
      closed,
    }),
    enqueue,
  } as StreamSubscriber;
  return consumer;
}
/** Internal bounded subscriber state owned by an Effect Scope or stream adapter. */
export const streamSubscriberCore = { createStreamSubscriber };
