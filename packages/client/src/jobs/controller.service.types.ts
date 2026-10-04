import type { JobWatchListener, JobWatchOptions, JobWatchState } from "./types.js";

/** Passive external-store state; asynchronous native work belongs to the feed service. */
export interface JobControllerView {
  readonly snapshot: () => JobWatchState<unknown>;
  readonly subscribe: (listener: JobWatchListener<unknown>) => () => void;
  readonly assertLive: () => void;
  readonly isDisconnected: () => boolean;
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly dispose: () => Promise<void>;
  readonly refetch: () => Promise<void>;
}

/** Once-acquired state factory sharing only complete-key physical observations. */
export interface JobControllerFactory {
  readonly view: (client: unknown, name: string, options: JobWatchOptions) => JobControllerView;
}
