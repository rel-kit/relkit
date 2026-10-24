/** Cumulative loss has an independent durable identity, outside the saturated application's buffer. */
import { Effect } from "effect";
import type { Schema } from "effect";
import type { InspectionCollectionBatch } from "./collection.schemas.js";
import type { InspectorHistoryOperations } from "./history.types.js";

/** One tiny transaction follows record persistence; a lost ACK reuses the same receipt key. */
export const persistCollectionLoss = Effect.fn("Inspector.persistLoss")(function* (
  history: InspectorHistoryOperations,
  batch: Schema.Schema.Type<typeof InspectionCollectionBatch>,
  sessionId: string,
  previous?: string,
) {
  const totals = [
    batch.droppedRecords,
    batch.droppedBytes ?? 0,
    batch.producerFailed ?? 0,
    batch.producerDropped ?? 0,
  ];
  if (totals.every((value) => value === 0)) return undefined;
  const key = `${sessionId}:loss:${totals.join(":")}`;
  if (key !== previous)
    yield* history.call({
      type: "append",
      records: [
        {
          key,
          origin: "inspector",
          record: {
            version: 2,
            signal: "diagnostic",
            code: "RELKIT_INSPECTION_INCOMPLETE",
            severity: "warning",
            occurredAt: new Date().toISOString(),
            message: `Inspection is incomplete: ${totals[0]} retained records lost (${totals[1]} bytes), ${totals[2]} producer failures, ${totals[3]} producer records dropped.`,
          },
        },
      ],
    });
  return key;
});
