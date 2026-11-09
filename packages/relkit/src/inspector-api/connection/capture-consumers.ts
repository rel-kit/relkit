/**
 * Tracks each collecting Inspector's acknowledgement so one Inspector cannot retire records
 * another has not read. Capture releases only the prefix every active collector has persisted;
 * a collector that stops polling expires, so it cannot pin the buffer.
 */
import { Clock, Effect, Ref } from "effect";

/** Header naming the collecting Inspector; collectors that omit it share one legacy cursor. */
export const CAPTURE_CONSUMER_HEADER = "x-relkit-inspection-consumer";

/** A collector that has not polled for this long no longer holds records back. */
export const CAPTURE_CONSUMER_TTL_MS = 30_000;

const LEGACY_CONSUMER = "default";

interface ConsumerCursor {
  readonly through: number;
  readonly seenAt: number;
}

/** Per-collector acknowledgement positions for one capture session. */
export type CaptureConsumers = Ref.Ref<ReadonlyMap<string, ConsumerCursor>>;

/** Creates the empty cursor table owned by one capture session. */
export const makeCaptureConsumers = (): Effect.Effect<CaptureConsumers> =>
  Ref.make<ReadonlyMap<string, ConsumerCursor>>(new Map());

/**
 * Names the collector of a bridge request.
 * @param request - Authenticated bridge records or ack request.
 * @returns The collector's identity, or the shared legacy identity when absent or malformed.
 */
export function captureConsumer(request: Request): string {
  const value = request.headers.get(CAPTURE_CONSUMER_HEADER);
  return value !== null && /^[A-Za-z0-9-]{1,64}$/.test(value) ? value : LEGACY_CONSUMER;
}

/**
 * Registers a polling collector at the cursor it reads after, so records it has not acknowledged
 * stay buffered for it.
 * @param consumers - Session cursor table.
 * @param consumer - Collector identity.
 * @param after - Cursor the collector is reading after.
 * @returns Completion once the collector is marked active.
 */
export const recordCaptureRead = Effect.fn("Inspection.consumerRead")(function* (
  consumers: CaptureConsumers,
  consumer: string,
  after: number,
) {
  const now = yield* Clock.currentTimeMillis;
  yield* Ref.update(consumers, (table) => {
    const current = table.get(consumer);
    return new Map(table).set(consumer, {
      through: current === undefined ? after : Math.max(current.through, after),
      seenAt: now,
    });
  });
});

/**
 * Records one collector's acknowledgement and computes what every active collector has persisted.
 * @param consumers - Session cursor table.
 * @param consumer - Acknowledging collector.
 * @param through - Its persisted sequence.
 * @returns The highest sequence safe to retire from capture.
 */
export const recordCaptureAcknowledgement = Effect.fn("Inspection.consumerAck")(function* (
  consumers: CaptureConsumers,
  consumer: string,
  through: number,
) {
  const now = yield* Clock.currentTimeMillis;
  return yield* Ref.modify(consumers, (table) => {
    const next = new Map<string, ConsumerCursor>();
    for (const [name, cursor] of table)
      if (name !== consumer && now - cursor.seenAt <= CAPTURE_CONSUMER_TTL_MS)
        next.set(name, cursor);
    const previous = table.get(consumer)?.through ?? 0;
    next.set(consumer, { through: Math.max(previous, through), seenAt: now });
    const release = Math.min(...[...next.values()].map((cursor) => cursor.through));
    return [release, next] as const;
  });
});
