/** UI invalidations borrow the existing bounded stream, while full records stay in history. */
import { Effect } from "effect";
import { createObservabilityStream } from "@relkit/observability";
import type { ObservabilityStream, ObservabilityStreamEventType } from "@relkit/observability";
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
  stream.publish({
    type: "generation.changed",
    data: {
      state: next.state,
      sessionId: after?.sessionId ?? null,
      generationId: after?.generationId ?? null,
    },
  });
}

/** One small invalidation per signal follows the committed batch; no history copy is retained. */
export function publishCollection(
  stream: ObservabilityStream,
  changes: readonly ObservabilityStreamEventType[],
) {
  for (const type of changes) stream.publish({ type, data: {} });
}
