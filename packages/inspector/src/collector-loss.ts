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

/**
 * Records skipped sequences, such as records retired before this Inspector read them, as loss.
 * @param history - Inspector history receiving the diagnostic.
 * @param sessionId - Collected session.
 * @param after - Last sequence this Inspector had persisted.
 * @param next - First sequence the bridge returned.
 * @param evicted - Records the buffer evicted meanwhile, already reported as retained loss.
 * @returns Completion; a replayed batch reuses the same receipt key.
 */
export const persistCollectionGap = Effect.fn("Inspector.persistGap")(function* (
  history: InspectorHistoryOperations,
  sessionId: string,
  after: number,
  next: number,
  evicted: number = 0,
) {
  const skipped = next - after - 1;
  if (skipped <= evicted) return;
  yield* history.call({
    type: "append",
    records: [
      {
        key: `${sessionId}:gap:${after}:${next}`,
        origin: "inspector",
        record: {
          version: 2,
          signal: "diagnostic",
          code: "RELKIT_INSPECTION_INCOMPLETE",
          severity: "warning",
          occurredAt: new Date().toISOString(),
          message: `Inspection is incomplete: ${skipped} records (sequences ${after + 1}-${next - 1}) were no longer retained when this Inspector collected.`,
        },
      },
    ],
  });
});
