/**
 * SQL for durable events. Publication is one statement: it inserts the
 * envelope into the outbox and, from the registered consumers of that event
 * version, one delivery row per consumer, so the event and its deliveries
 * commit or roll back together. Each delivery is leased, retried and
 * dead-lettered on its own, so one failing consumer never re-runs another.
 */
import type { UnknownEventEnvelope } from "relkit/events";
import type { JobFailureMetadata } from "relkit/providers-local";
import { Effect } from "effect";
import * as SqlClient from "effect/sql/SqlClient";
import type { PostgresTables } from "../schema.types.js";
import { backendOperation } from "./database.js";
import type { DeliveryRow } from "./events-store.types.js";
export type { DeliveryRow } from "./events-store.types.js";

/**
 * Persists an envelope and fans it out to the event's registered consumers.
 * @param tables - Namespace tables.
 * @param profile - Event provider profile.
 * @param envelope - Envelope to persist.
 * @returns The number of deliveries created.
 */
export const publishEvent = Effect.fn("Postgres.events.publish")(function* (
  tables: PostgresTables,
  profile: string,
  envelope: UnknownEventEnvelope,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`with outbox as (
      insert into ${sql.literal(tables.eventOutbox)} (instance_id, profile, event_id, version, envelope)
      values (${envelope.instanceId}, ${profile}, ${envelope.eventId}, ${envelope.version},
        ${JSON.stringify(envelope)}::jsonb)
      returning instance_id)
    insert into ${sql.literal(tables.eventDeliveries)} (instance_id, profile, trigger_id)
    select outbox.instance_id, consumer.profile, consumer.trigger_id
    from outbox, ${sql.literal(tables.eventConsumers)} as consumer
    where consumer.profile = ${profile} and consumer.event_id = ${envelope.eventId}
      and consumer.version = ${envelope.version}
    returning trigger_id`;
  return rows.length;
}, backendOperation("events.publish"));

/**
 * Records a durable consumer so later publications create deliveries for it.
 * @param tables - Namespace tables.
 * @param profile - Event provider profile.
 * @param consumer - Trigger ID with the event contract it consumes.
 */
export const registerConsumer = Effect.fn("Postgres.events.registerConsumer")(function* (
  tables: PostgresTables,
  profile: string,
  consumer: { readonly triggerId: string; readonly eventId: string; readonly version: number },
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`insert into ${sql.literal(tables.eventConsumers)} (profile, trigger_id, event_id, version)
    values (${profile}, ${consumer.triggerId}, ${consumer.eventId}, ${consumer.version})
    on conflict (profile, trigger_id) do update set event_id = excluded.event_id,
      version = excluded.version, registered_at = now()`;
}, backendOperation("events.registerConsumer"));

/**
 * Leases the oldest due delivery of one consumer, including ones whose lease expired.
 * @param tables - Namespace tables.
 * @param profile - Event provider profile.
 * @param triggerId - Consumer.
 * @param owner - Owner token fencing settlement.
 * @param leaseMs - Lease duration.
 * @returns The leased delivery with its envelope, or undefined.
 */
export const leaseDelivery = Effect.fn("Postgres.events.lease")(function* (
  tables: PostgresTables,
  profile: string,
  triggerId: string,
  owner: string,
  leaseMs: number,
) {
  const sql = yield* SqlClient.SqlClient;
  const deliveries = sql.literal(tables.eventDeliveries);
  const rows = yield* sql<DeliveryRow>`with candidate as (
      select instance_id from ${deliveries}
      where profile = ${profile} and trigger_id = ${triggerId}
        and ((status = 'available' and run_at <= now())
          or (status = 'leased' and lease_expires_at < now()))
      order by run_at for update skip locked limit 1)
    update ${deliveries} as delivery set status = 'leased', attempt = delivery.attempt + 1,
      lease_owner = ${owner}, lease_expires_at = now() + ${leaseMs} * interval '1 millisecond'
    from candidate, ${sql.literal(tables.eventOutbox)} as outbox
    where delivery.instance_id = candidate.instance_id and delivery.trigger_id = ${triggerId}
      and outbox.instance_id = delivery.instance_id
    returning delivery.instance_id, delivery.trigger_id, delivery.attempt, outbox.envelope`;
  return rows[0];
}, backendOperation("events.lease"));

/**
 * Settles a leased delivery, fenced on its owner token.
 * @param tables - Namespace tables.
 * @param delivery - Leased delivery.
 * @param owner - Owner token from the lease.
 * @param outcome - `completed`, a retry after `delayMs`, or `dead-lettered` with failure metadata.
 * @returns True when this owner settled the delivery.
 */
export const settleDelivery = Effect.fn("Postgres.events.settle")(function* (
  tables: PostgresTables,
  delivery: Pick<DeliveryRow, "instance_id" | "trigger_id">,
  owner: string,
  outcome:
    | { readonly state: "completed" }
    | {
        readonly state: "delayed" | "dead-lettered";
        readonly delayMs: number;
        readonly failure: JobFailureMetadata;
      },
) {
  const sql = yield* SqlClient.SqlClient;
  const status = outcome.state === "delayed" ? "available" : outcome.state;
  const failure = outcome.state === "completed" ? null : JSON.stringify(outcome.failure);
  const delay = outcome.state === "delayed" ? outcome.delayMs : 0;
  const rows = yield* sql`update ${sql.literal(tables.eventDeliveries)} set status = ${status},
      error = ${failure}::jsonb, run_at = now() + ${delay} * interval '1 millisecond',
      completed_at = case when ${status} = 'available' then null else now() end,
      lease_owner = null, lease_expires_at = null
    where instance_id = ${delivery.instance_id} and trigger_id = ${delivery.trigger_id}
      and lease_owner = ${owner} and status = 'leased'
    returning instance_id`;
  return rows.length === 1;
}, backendOperation("events.settle"));
