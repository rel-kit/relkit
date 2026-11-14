/** UI invalidations borrow the existing bounded stream, while full records stay in history. */
import { Effect } from "effect";
import { createObservabilityStream } from "relkit/observability";
import type { ObservabilityStream, ObservabilityStreamEventType } from "relkit/observability";
import type { InspectorSelection } from "./discovery.types.js";

/** The tool Scope closes every subscriber before releasing its listener. */
export const acquireLiveEvents = Effect.acquireRelease(
  Effect.sync(() =>
    createObservabilityStream({
      maxEvents: 64,
      queueSize: 64,
      maxQueueSize: 256,
      overflow: "disconnect",
    }),
  ),
  (stream) => Effect.sync(() => stream.close()),
);

/** Session/generation changes invalidate metadata without exposing session credentials. */
export function publishSelection(
  stream: ObservabilityStream,
  previous: InspectorSelection,
  next: InspectorSelection,
) {
  const before = previous.state === "connected" ? previous.handshake : undefined;
  const after = next.state === "connected" ? next.handshake : undefined;
  if (
    before?.sessionId === after?.sessionId &&
    before?.generationId === after?.generationId &&
    previous.state === next.state
  )
    return;
  publishSelectionState(stream, next);
}

/**
 * Publishes the application session state whether or not it changed: a new subscriber needs it
 * before the next change, and a repeated one only invalidates metadata again.
 * @param stream - Tool-owned event feed.
 * @param selection - Current application session.
 */
export function publishSelectionState(stream: ObservabilityStream, selection: InspectorSelection) {
  const handshake = selection.state === "connected" ? selection.handshake : undefined;
  stream.publish({
    type: "generation.changed",
    data: {
      state: selection.state,
      sessionId: handshake?.sessionId ?? null,
      generationId: handshake?.generationId ?? null,
    },
  });
}

/** One terminal line about the application session. */
export interface SelectionNotice {
  readonly level: "info" | "warn";
  readonly message: string;
}

/**
 * Says what changed in the application session, so the terminal never repeats a line per poll.
 * @param previous - Session before this discovery; undefined on the first one.
 * @param next - Session found now.
 * @param project - Project root or connection file the Inspector watches.
 * @returns Lines to log, empty when the session state is unchanged.
 */
export function selectionNotices(
  previous: InspectorSelection | undefined,
  next: InspectorSelection,
  project: string,
): SelectionNotice[] {
  if (previous !== undefined && selectionKey(previous) === selectionKey(next)) return [];
  const notices: SelectionNotice[] = [];
  if (previous?.state === "connected")
    notices.push({
      level: "warn",
      message: `The \`relkit dev\` session ${previous.handshake.sessionId} for ${project} stopped answering; waiting for a session.`,
    });
  if (next.state === "connected")
    notices.push({
      level: "info",
      message: `Connected to the \`relkit dev\` session ${next.handshake.sessionId} for ${project}.`,
    });
  else if (next.state === "ambiguous")
    notices.push({
      level: "warn",
      message: `${next.sessions.length} running \`relkit dev\` sessions for ${project} (${next.sessions.join(", ")}); pass --connection-file to choose one.`,
    });
  else if (previous?.state !== "connected")
    notices.push({
      level: "info",
      message: `No running \`relkit dev\` session for ${project}; waiting. Start \`relkit dev\` with \`inspector: { enabled: true }\` in the app config.`,
    });
  return notices;
}

/**
 * @param selection - Application session.
 * @returns Identity of its state; generations of one session share it.
 */
export function selectionKey(selection: InspectorSelection): string {
  if (selection.state === "connected") return `connected:${selection.handshake.sessionId}`;
  if (selection.state === "ambiguous")
    return `ambiguous:${[...selection.sessions].sort().join(",")}`;
  return "disconnected";
}

/** One small invalidation per signal follows the committed batch; no history copy is retained. */
export function publishCollection(
  stream: ObservabilityStream,
  changes: readonly ObservabilityStreamEventType[],
) {
  for (const type of changes) stream.publish({ type, data: {} });
}
