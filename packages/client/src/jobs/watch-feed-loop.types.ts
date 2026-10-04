import type { RunWatchFrame } from "@relkit/contracts/jobs";
import type { JobWatchOptions } from "./types.js";
import type { FeedEvent } from "./watch-feed.types.js";

/**
 * State authority shared by native and polling observation workflows.
 * @typeParam Run - Application-specific run payload retained by the observation state.
 */
export interface WatchFeedLoop<Run> {
  readonly client: unknown;
  readonly name: string;
  readonly options: JobWatchOptions;
  readonly isActive: (generation: number) => boolean;
  readonly lastCursor: () => string | undefined;
  readonly setAbort: (controller: AbortController | undefined) => void;
  readonly setIterator: (iterator: AsyncIterator<unknown> | undefined) => void;
  readonly acceptFrame: (value: unknown) => RunWatchFrame<Run> | undefined;
  readonly emit: (event: FeedEvent<Run>) => void;
  readonly verifyTerminal: (
    frame: RunWatchFrame<Run>,
    signal: AbortSignal,
  ) => Promise<boolean | undefined>;
  readonly releaseTerminal: () => void;
  readonly resolveFirsts: () => void;
  readonly rejectFirsts: (error: unknown) => void;
  readonly failureCount: () => number;
  readonly setFailureCount: (value: number) => void;
}
