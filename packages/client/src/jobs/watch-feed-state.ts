import type { WatchFeedState } from "./watch-feed-state.types.js";
import type { RunWatchFrame } from "@relkit/contracts/jobs";
import { isFrame } from "./watch-feed-support.js";
export type { WatchFeedState } from "./watch-feed-state.types.js";

/**
 * Creates the initial empty observation cache with no native resources.
 * @typeParam Run - Application-specific observed run payload.
 * @returns An empty frame cache with no retained cursor.
 */
export function emptyWatchFeedState<Run>(): WatchFeedState<Run> {
  return { lastFrame: undefined, lastCursor: undefined, lastSequence: -1, nativeEpoch: undefined };
}

/**
 * Applies epoch changes and duplicate suppression without losing retained cursor authority.
 * @typeParam Run - Application-specific observed run payload.
 * @param state - Current owned state.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The updated cache and accepted frame, if any.
 */
export function acceptWatchFrame<Run>(
  state: WatchFeedState<Run>,
  value: unknown,
): { readonly state: WatchFeedState<Run>; readonly frame: RunWatchFrame<Run> | undefined } {
  if (!isFrame(value)) return { state, frame: undefined };
  const frame = value as RunWatchFrame<Run>;
  const next =
    state.nativeEpoch === frame.epoch
      ? state
      : { ...state, nativeEpoch: frame.epoch, lastSequence: -1, lastCursor: undefined };
  const duplicate =
    frame.sequence <= next.lastSequence ||
    (frame.cursor !== undefined && frame.cursor === next.lastCursor);
  if (frame.kind !== "reset" && duplicate) return { state: next, frame: undefined };
  if (
    frame.kind === "reset" &&
    frame.sequence === next.lastSequence &&
    frame.cursor === next.lastCursor
  )
    return { state: next, frame: undefined };
  return {
    state: {
      ...next,
      lastSequence: frame.sequence,
      lastCursor: frame.cursor === undefined ? next.lastCursor : frame.cursor,
      lastFrame: frame,
    },
    frame,
  };
}
