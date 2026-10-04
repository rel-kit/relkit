import type { RunWatchFrame } from "@relkit/contracts/jobs";

/**
 * Canonical native frame or physical observation lifecycle publication.
 * @typeParam Run - Application-specific run payload retained by the frame.
 */
export type FeedEvent<Run> =
  | { readonly kind: "frame"; readonly frame: RunWatchFrame<Run> }
  | { readonly kind: "status"; readonly status: FeedStatus; readonly error?: unknown };

/** Physical observation states projected into each passive external-store view. */
export type FeedStatus =
  "connecting" | "connected" | "reconnecting" | "completed" | "unauthorized" | "error";

/**
 * Synchronous observer isolated from another view and the native worker lifetime.
 * @typeParam Run - Application-specific run payload supplied by each frame.
 */
export type FeedObserver<Run> = (event: FeedEvent<Run>) => void;
