import type { RunWatchFrame } from "@relkit/contracts/jobs";
import { isTerminalRun, type JobWatchOptions, type JobWatchState } from "./types.js";
import type { FeedEvent } from "./watch-feed.js";

/**
 * Projects observation status or frames into the existing external-store state.
 * @typeParam Run - Application-specific observed run payload.
 * @param current - Current external-store state.
 * @param event - Canonical observation event.
 * @param source - Existing observation source.
 * @returns The projected external-store snapshot.
 */
export function stateFromFeedEvent<Run>(
  current: JobWatchState<Run>,
  event: FeedEvent<Run>,
  source: JobWatchOptions["source"],
): JobWatchState<Run> {
  if (event.kind === "status") {
    if (event.status === "unauthorized") {
      return { connection: "unauthorized", isStale: false, connectionError: event.error };
    }
    if (event.status === "error") {
      return { ...current, connection: "error", isStale: false, connectionError: event.error };
    }
    const connection = event.status === "completed" ? "completed" : event.status;
    return {
      ...current,
      connection,
      isStale: event.status === "reconnecting",
      ...(event.error === undefined ? {} : { connectionError: event.error }),
    };
  }
  const frame = event.frame as RunWatchFrame<Run>;
  const run = frame.run;
  const {
    connectionError: _connectionError,
    resetReason: _resetReason,
    ...withoutDiagnostics
  } = current;
  return {
    ...withoutDiagnostics,
    ...(isTerminalRun(run)
      ? { connection: "completed" as const }
      : { connection: "connected" as const }),
    run,
    isStale: frame.kind === "reset",
    lastObservedAt: frame.observedAt,
    ...(frame.kind === "snapshot"
      ? { continuity: frame.continuity }
      : current.continuity === undefined
        ? {}
        : { continuity: current.continuity }),
    source: source ?? current.source ?? "native",
    epoch: frame.epoch,
    sequence: frame.sequence,
    ...(frame.cursor === undefined ? {} : { cursor: frame.cursor }),
    ...(frame.kind === "reset" ? { resetReason: frame.reason } : {}),
    connectionError: undefined,
  };
}
