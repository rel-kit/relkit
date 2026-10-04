import type { RunWatchFrame } from "@relkit/contracts/jobs";
import { authoritativeFrame } from "./reconcile.js";
import { isTerminalRun } from "./types.js";
import type { JobWatchOptions } from "./watch.types.js";
import { withAfter } from "./watch-feed-support.js";
import type { FeedEvent } from "./watch-feed.types.js";

/**
 * Confirms terminal evidence and publishes the authoritative frame.
 * @typeParam Run - Declared observed run payload.
 * @param client - Borrowed generated procedure client.
 * @param name - Declared job name.
 * @param options - Existing read and identity authority.
 * @param frame - Proposed terminal observation.
 * @param signal - Borrowed cancellation signal from the observation owner.
 * @param accept - Existing epoch and duplicate acceptance boundary.
 * @param emit - Borrowed safe publication callback.
 * @returns Whether authoritative state confirms completion, or undefined if unavailable.
 */
export async function verifyWatchTerminal<Run>(
  client: unknown,
  name: string,
  options: JobWatchOptions,
  frame: RunWatchFrame<Run>,
  signal: AbortSignal,
  accept: (value: unknown) => RunWatchFrame<Run> | undefined,
  emit: (event: FeedEvent<Run>) => void,
): Promise<boolean | undefined> {
  const verified = await authoritativeFrame(client, name, withAfter(options, frame.cursor), signal);
  if (verified === undefined) return undefined;
  const accepted = accept(verified);
  if (accepted !== undefined) emit({ kind: "frame", frame: accepted });
  else if (isTerminalRun(verified.run))
    emit({ kind: "frame", frame: verified as RunWatchFrame<Run> });
  return isTerminalRun(verified.run);
}
