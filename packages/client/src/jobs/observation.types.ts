import type { WatchFeedLoop } from "./watch-feed-loop.types.js";

/** Contract for one independently cancellable shared observation lifetime. */
export interface JobObservationService {
  /** Observes one physical feed until confirmed completion or retirement.
   * @typeParam Run - Application-declared run payload.
   * @param feed - Native dependency and authoritative observation state.
   * @param generation - Active worker generation rejecting stale callbacks.
   * @param signal - Abort that stops the observation and its native requests.
   * @returns Settles when observation ends; rejects with the original failure or on abort. */
  readonly consume: <Run>(
    feed: WatchFeedLoop<Run>,
    generation: number,
    signal?: AbortSignal,
  ) => Promise<void>;
}
