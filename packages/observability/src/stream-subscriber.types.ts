import type { ObservabilityStreamEvent, ObservabilityStream } from "./stream.types.js";
/** Stream consumer plus the producer's internal enqueue operation. */
export type StreamSubscriber = ReturnType<ObservabilityStream["subscribe"]> & {
  readonly enqueue: (event: ObservabilityStreamEvent) => void;
};
/** Resolver for one pending stream read. */
export type StreamWaiter = (result: IteratorResult<ObservabilityStreamEvent>) => void;
