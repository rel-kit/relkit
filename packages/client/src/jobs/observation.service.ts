import { runWatchFeed } from "./watch-feed-loop.js";
import type { JobObservationService } from "./observation.types.js";

/**
 * Live native/polling observation workflow; native dependencies are supplied by each feed.
 * @remarks `consume` preserves native failures and stops when its signal aborts.
 * @see tests/jobs/quality.test.ts for checked observation, recovery and abort cases.
 * @example await jobObservation.consume(feed, generation, signal);
 */
export const jobObservation: JobObservationService = {
  consume: (feed, generation, signal) => runWatchFeed(feed, generation, signal),
};
