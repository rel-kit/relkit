/**
 * Collects one batch from the connected application session into history. A batch is
 * acknowledged to the application only once history holds it, so a batch history could not store
 * stays in the application's buffer and the next pull stores it. What still goes missing is
 * counted and named: records the store refuses, and a pulled batch whose session ended before
 * history could store it.
 */
import { Effect, Ref } from "effect";
import type { ObservabilityStream } from "relkit/observability";
import { collectInspectionBatch } from "./collector.js";
import type { InspectorHistoryOperations } from "./history.types.js";
import { publishCollection } from "./live-events.js";
import type { InspectorOptions } from "./options.types.js";
import type { InspectorRemoteOperations } from "./remote.types.js";
import { quietHistory } from "./tool-history.js";
import type { InspectorToolStateRef } from "./tool-state.types.js";

/**
 * Pulls, stores and acknowledges one batch of the connected session.
 * @param state - Tool state.
 * @param remote - Application transport.
 * @param options - Launch options.
 * @param stream - The interface's live feed.
 * @returns False when there is no session or no history; else whether records remain to pull.
 */
export const collectCurrent = Effect.fn("Inspector.collectCurrent")(function* (
  state: InspectorToolStateRef,
  remote: InspectorRemoteOperations,
  options: InspectorOptions,
  stream: ObservabilityStream,
) {
  const current = yield* Ref.get(state);
  if (current.selection.state !== "connected" || !current.history) return false;
  const sessionId = current.selection.connection.descriptor.sessionId;
  const history = quietHistory(current.history.operations);
  yield* settleUnstored(state, history, sessionId);
  const after = sessionId === current.sessionId ? current.through : 0;
  const batch = yield* collectInspectionBatch(
    remote,
    history,
    current.selection.connection,
    after,
    options.target,
    current.lossKey,
    sessionId === current.sessionId ? current.droppedRecords : 0,
    (records, through) =>
      Ref.update(state, (value) => ({
        ...value,
        unstored: { sessionId, after, through, records },
      })),
  );
  publishCollection(stream, batch.changes);
  yield* Ref.update(state, (value) => ({
    ...value,
    sessionId,
    through: batch.through,
    error: undefined,
    // A gap is reported by one batch only; the records it skipped stay missing for the session.
    incomplete:
      batch.incomplete || batch.gap || (value.sessionId === sessionId && value.incomplete),
    droppedRecords: batch.droppedRecords,
    lossKey: batch.lossKey,
    producerFailed: batch.producerFailed,
    producerDropped: batch.producerDropped,
    unstored: undefined,
    historyLost: (value.historyLost ?? 0) + batch.refused,
  }));
  return { backlog: batch.backlog };
});

/**
 * Gives up a batch pulled from a session that has ended since: its records are gone with the
 * application's buffer. Writes a diagnostic naming them, then counts them as lost.
 */
const settleUnstored = Effect.fn("Inspector.settleUnstored")(function* (
  state: InspectorToolStateRef,
  history: InspectorHistoryOperations,
  sessionId: string,
) {
  const unstored = (yield* Ref.get(state)).unstored;
  if (unstored === undefined || unstored.sessionId === sessionId) return;
  yield* history.call({
    type: "append",
    records: [
      {
        key: `${unstored.sessionId}:unstored:${unstored.after}:${unstored.through}`,
        origin: "inspector",
        record: {
          version: 2,
          signal: "diagnostic",
          code: "RELKIT_INSPECTION_INCOMPLETE",
          severity: "warning",
          occurredAt: new Date().toISOString(),
          message: `Inspection is incomplete: ${unstored.records} records (sequences ${unstored.after + 1}-${unstored.through}) of application session ${unstored.sessionId} were collected while history could not store them, and that session ended before it could.`,
        },
      },
    ],
  });
  yield* Ref.update(state, (value) => ({
    ...value,
    unstored: undefined,
    historyLost: (value.historyLost ?? 0) + unstored.records,
  }));
});
