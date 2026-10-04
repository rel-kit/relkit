import type { RunWatchFrame } from "@relkit/contracts/jobs";
import { authoritativeFrame } from "./reconcile.js";
import type { JobWatchOptions } from "./types.js";
import { withAfter } from "./watch-feed-support.js";

/**
 * Owns a temporary authoritative read while respecting borrowed cancellation.
 * @typeParam Run - Application-specific observed run payload.
 * @param client - Borrowed generated procedure client.
 * @param name - Declared resource or selector identity.
 * @param options - Existing public configuration and authority.
 * @param lastCursor - Existing last cursor supplied by the owning operation.
 * @param signal - Borrowed caller cancellation signal.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
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
