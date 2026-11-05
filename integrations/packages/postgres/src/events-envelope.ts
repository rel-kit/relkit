/**
 * Builds the event envelope that publication persists in the outbox. Both the
 * provider's `publish` and the Drizzle outbox use it, so an event written
 * inside an application transaction is indistinguishable from one published
 * directly. Pure construction; no connection is opened.
 */
import type { TracePropagation } from "relkit/contracts";
import type { EventPublishOptions, UnknownEventEnvelope } from "relkit/events";

/**
 * Creates a new envelope for one publication.
 * @param eventId - Event contract ID.
 * @param version - Event contract version.
 * @param payload - Validated payload.
 * @param options - Optional ordering key and attributes.
 * @param propagation - Optional producer trace context.
 * @returns A frozen envelope with a fresh instance ID and the current time.
 * @example createEventEnvelope("orders.placed", 1, { orderId: "o-1" }).instanceId.startsWith("event-");
 * @experimental
 */
export function createEventEnvelope(
  eventId: string,
  version: number,
  payload: UnknownEventEnvelope["payload"],
  options: EventPublishOptions = {},
  propagation?: TracePropagation,
): UnknownEventEnvelope {
  const timestamp = new Date().toISOString();
  return Object.freeze({
    instanceId: `event-${randomUUID()}`,
    eventId,
    version,
    payload,
    occurredAt: timestamp,
    publishedAt: timestamp,
    ...(options.key === undefined ? {} : { key: options.key }),
    ...(propagation === undefined ? {} : { propagation }),
    attributes: options.attributes ?? {},
  });
}
