import type { RunWatchFrame } from "@relkit/contracts/jobs";

/**
 * Accepted frame, epoch, sequence and cursor retained by one shared observation feed.
 * @typeParam Run - Application-specific run payload retained by the observation state.
 */
export interface WatchFeedState<Run> {
  readonly lastFrame: RunWatchFrame<Run> | undefined;
  readonly lastCursor: string | undefined;
  readonly lastSequence: number;
  readonly nativeEpoch: string | undefined;
}
