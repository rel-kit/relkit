import type { Effect } from "effect";
import type { WatchFeedLoop } from "./watch-feed-loop.types.js";

/** Live/test contract for one independently cancellable shared observation lifetime. */
export interface JobObservationService {
  /** Observes one physical feed until confirmed completion or retirement.
   * @typeParam Run - Application-declared run payload.
   * @param feed - Native dependency and authoritative observation state.
   * @param generation - Active worker generation rejecting stale callbacks.
   * @returns A lazy observed and interruptible workflow preserving native failures. */
  readonly consume: <Run>(
    feed: WatchFeedLoop<Run>,
    generation: number,
  ) => Effect.Effect<void, unknown>;
}
