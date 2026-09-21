import type { RunWatchFrame } from "@relkit/contracts/jobs";
import { authoritativeFrame } from "./reconcile.js";
import type { JobWatchOptions } from "./types.js";
import { withAfter } from "./watch-feed-support.js";

export async function refetchSharedWatchFeed<Run>(
  client: unknown,
  name: string,
  options: JobWatchOptions,
  lastCursor: string | undefined,
  signal?: AbortSignal,
): Promise<RunWatchFrame<Run> | undefined> {
  const controller = signal === undefined ? new AbortController() : undefined;
  try {
    return (await authoritativeFrame(
      client,
      name,
      withAfter(options, lastCursor),
      signal ?? controller!.signal,
    )) as RunWatchFrame<Run> | undefined;
  } finally {
    controller?.abort();
  }
}
