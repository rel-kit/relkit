import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import type { FeedEvent } from "../../src/jobs/watch-feed.types.js";

/** Assertion-bearing mutable controls for a deterministic physical observation. */
export interface QualityControl {
  active: boolean;
  failures: number;
  abort?: AbortController | undefined;
  events: FeedEvent<RunSnapshot>[];
  rejected: unknown[];
}

/** Native lifecycle callbacks preserving the original quality fixture transitions. */
export interface QualityHooks {
  readonly onAbort?: (controller: AbortController) => void;
  readonly onAccepted?: (control: QualityControl) => void;
  readonly onIterator?: (control: QualityControl) => void;
  readonly onResolveFirsts?: (control: QualityControl) => void;
  readonly onVerifyTerminal?: (
    frame: RunWatchFrame<RunSnapshot>,
    signal: AbortSignal,
  ) => Promise<boolean | undefined> | boolean | undefined;
}
