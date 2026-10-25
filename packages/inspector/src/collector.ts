/** Commits a finite replay batch before ACK; lost ACKs replay stable keys without duplicate writes. */
import { Effect, Schema } from "effect";
import { admitObservabilityRecordEffect } from "@relkit/observability";
import {
  InspectionConnectionError,
  inspectionReplayRecord,
} from "@relkit/inspector-api/connection";
import type { InspectionConnectionFile } from "@relkit/inspector-api/connection";
import type { InspectorRemoteOperations } from "./remote.types.js";
import type { InspectorHistoryOperations } from "./history.types.js";
import { InspectionCollectionBatch } from "./collection.schemas.js";
import { collectionChange } from "./collector-changes.js";
import { persistCollectionLoss } from "./collector-loss.js";
import { observeExecution } from "@relkit/contracts/operation";

/** One bounded pull needs no independent pending queue or in-memory history copy. */
export const collectInspectionBatch = Effect.fn("Inspector.collectBatch")(
  function* (
    remote: InspectorRemoteOperations,
    history: InspectorHistoryOperations,
    connection: InspectionConnectionFile,
    after: number,
    target?: string,
    previousLossKey?: string,
  ) {
    const response = yield* remote.request(
      connection,
      `/_relkit/bridge/v1/records?after=${after}`,
      {},
      target,
    );
    const batch = yield* remote.json(response).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(InspectionCollectionBatch)),
      Effect.mapError((cause) =>
        cause instanceof InspectionConnectionError
          ? cause
          : new InspectionConnectionError({ operation: "collection.invalid", cause }),
      ),
    );
    let through = after;
    for (const entry of batch.records) {
      if (entry.sequence <= through)
        return yield* new InspectionConnectionError({
          operation: "collection.sequence",
          cause: new Error("Collection sequences must advance monotonically"),
        });
      through = entry.sequence;
    }
    const records = yield* admitBatch(connection.descriptor.sessionId, batch.records);
    if (Buffer.byteLength(JSON.stringify(records)) > 1_048_576)
      return yield* new InspectionConnectionError({
        operation: "collection.oversized",
        cause: new Error("Persistence batch exceeds one MiB"),
      });
    if (records.length > 0) {
      yield* history.call({ type: "append", records });
    }
    const lossKey = yield* persistCollectionLoss(
      history,
      batch,
      connection.descriptor.sessionId,
      previousLossKey,
    );
    if (records.length > 0) yield* acknowledgeCollection(remote, connection, through, target);
    return {
      through,
      gap: batch.gap,
      droppedRecords: batch.droppedRecords,
      incomplete: batch.incomplete,
      records: batch.records.length,
      lossKey,
      producerFailed: batch.producerFailed ?? 0,
      producerDropped: batch.producerDropped ?? 0,
      changes: [...new Set(records.map((entry) => collectionChange(entry.record)))],
    };
  },
  (effect) => observeExecution("inspector", "collection.batch", effect, () => ({ batches: 1 })),
);

/** Revalidates decoded records before constructing the same envelope used by capture's byte budget. */
function admitBatch(
  sessionId: string,
  entries: (typeof InspectionCollectionBatch.Type)["records"],
) {
  return Effect.forEach(
    entries,
    (entry) =>
      Effect.gen(function* () {
        const record = yield* admitObservabilityRecordEffect(entry.record).pipe(
          Effect.mapError(
            (cause) =>
              new InspectionConnectionError({ operation: "collection.record-invalid", cause }),
          ),
        );
        if (!record)
          return yield* new InspectionConnectionError({
            operation: "collection.record-invalid",
            cause: new Error("Invalid decoded observability record"),
          });
        return inspectionReplayRecord(sessionId, { ...entry, record });
      }),
    { concurrency: 1 },
  );
}

/** Only a completed storage transaction permits the application's prefix to retire. */
const acknowledgeCollection = Effect.fn("Inspector.acknowledge")(function* (
  remote: InspectorRemoteOperations,
  connection: InspectionConnectionFile,
  through: number,
  target: string | undefined,
) {
  const response = yield* remote.request(
    connection,
    "/_relkit/bridge/v1/ack",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ through }),
    },
    target,
  );
  yield* remote.json(response);
});
