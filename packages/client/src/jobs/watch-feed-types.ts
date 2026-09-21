import type { RunWatchFrame } from "@relkit/contracts/jobs";

export type FeedEvent<Run> =
  | { readonly kind: "frame"; readonly frame: RunWatchFrame<Run> }
  | { readonly kind: "status"; readonly status: FeedStatus; readonly error?: unknown };

export type FeedStatus =
  "connecting" | "connected" | "reconnecting" | "completed" | "unauthorized" | "error";

export type FeedObserver<Run> = (event: FeedEvent<Run>) => void;
