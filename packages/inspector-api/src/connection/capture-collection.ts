/** Serves bounded replay batches and explicit gaps without retaining subscriber queues. */
import { Effect, Schema } from "effect";
import type { EarlyRetentionOperations, EarlyRetainedRecord } from "@relkit/observability/early";
import { InspectionConnectionError, rejectConnection } from "./connection-error.js";
import { readInspectionBody } from "./bridge-body.js";
import { inspectionReplayRecord } from "./replay-record.js";

const ack = Schema.fromJsonString(
  Schema.Struct({
    through: Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
    ),
  }),
);

/** Returns at most 256 records/1 MiB; cursors never imply durable persistence. */
export const collectCapture = Effect.fn("Inspection.collect")(function* (
  buffer: EarlyRetentionOperations,
  request: Request,
  incomplete = false,
  producer = { producerFailed: 0, producerDropped: 0, producerSourcesExceeded: false },
) {
  const url = new URL(request.url);
  if (url.pathname === "/_relkit/bridge/v1/ack" && request.method === "POST") {
    const body = yield* readInspectionBody(request);
    const value = yield* Schema.decodeUnknownEffect(ack)(new TextDecoder().decode(body)).pipe(
      Effect.mapError((cause) => new InspectionConnectionError({ operation: "body.ack", cause })),
    );
    yield* buffer
      .acknowledge(value.through)
      .pipe(
        Effect.mapError(
          (cause) => new InspectionConnectionError({ operation: "body.cursor", cause }),
        ),
      );
    return Response.json({ acknowledged: value.through });
  }
  if (url.pathname !== "/_relkit/bridge/v1/records" || request.method !== "GET")
    return new Response("Method not allowed", { status: 405 });
  const cursor = url.searchParams.get("after") ?? "0";
  if (!/^\d+$/.test(cursor) || !Number.isSafeInteger(Number(cursor)))
    return yield* rejectConnection("body.cursor");
  const after = Number(cursor);
  const entries = yield* buffer.snapshot();
  const status = yield* buffer.status();
  const records = captureRecords(entries, after);
  return Response.json(
    {
      records,
      gap: entries[0] !== undefined && after < entries[0].sequence - 1,
      ...status,
      ...producer,
      incomplete:
        status.incomplete ||
        incomplete ||
        producer.producerFailed > 0 ||
        producer.producerDropped > 0 ||
        producer.producerSourcesExceeded,
    },
    { headers: { "cache-control": "no-store" } },
  );
});

/** Complete UTF-8 wire envelopes share one finite response budget with its loss metadata. */
function captureRecords(entries: readonly EarlyRetainedRecord[], after: number) {
  const records = [];
  let bytes = 1024;
  let persistenceBytes = 2;
  for (const entry of entries) {
    if (entry.sequence <= after) continue;
    const wire = {
      sequence: entry.sequence,
      record: entry.record,
      ...(entry.identity === undefined ? {} : { identity: entry.identity }),
    };
    const size = Buffer.byteLength(JSON.stringify(wire));
    const persistenceSize = Buffer.byteLength(
      JSON.stringify(inspectionReplayRecord("00000000-0000-0000-0000-000000000000", wire)),
    );
    if (
      records.length === 256 ||
      bytes + size + 1 > 1_048_576 ||
      persistenceBytes + persistenceSize + 1 > 1_048_576
    )
      break;
    records.push(wire);
    bytes += size + 1;
    persistenceBytes += persistenceSize + 1;
  }
  return records;
}
