/**
 * Transactional outbox for Drizzle. `outbox(tx).publish(event, payload)`
 * validates the payload against the event contract and writes the envelope
 * and its per-consumer deliveries with one statement on the caller's Drizzle
 * transaction, so the event commits or rolls back with the transaction's other
 * writes. Consumers run later from the Postgres event provider's loops.
 */
import { sql, type SQL } from "drizzle-orm";
import type { EventDescriptor, EventPublishOptions, UnknownEventEnvelope } from "relkit/events";
import { createEventEnvelope } from "../events-envelope.js";
import { postgresTables } from "../schema.js";
import type { OutboxOptions, OutboxTransaction, PostgresOutbox } from "./outbox.types.js";
export type * from "./outbox.types.js";

/**
 * Binds the outbox to a Drizzle transaction (or database) on the backend's Postgres database.
 * @typeParam Result - What the driver's `execute` resolves to; ignored.
 * @param transaction - Drizzle transaction from `db.transaction(async (tx) => ...)`.
 * @param options - Event profile and table namespace; must match the event provider's.
 * @returns The outbox; `publish` resolves after the statement runs, before commit.
 * @example await db.transaction(async (tx) => outbox(tx).publish(orderPlaced, { orderId }));
 * @experimental
 */
export function outbox<Result>(
  transaction: OutboxTransaction<Result>,
  options: OutboxOptions = {},
): PostgresOutbox {
  const tables = postgresTables(options);
  return Object.freeze({
    publish: async <Id extends string, Version extends number, Input>(
      event: EventDescriptor<Id, Version, Input>,
      payload: Input,
      publishOptions: EventPublishOptions = {},
    ) => {
      const value = await validated(event, payload);
      const envelope = createEventEnvelope(event.id, event.version, value, publishOptions);
      const profile = event.profile ?? options.profile ?? "default";
      await transaction.execute(statement(tables, profile, envelope));
      return envelope as UnknownEventEnvelope & { readonly eventId: Id; readonly version: Version };
    },
  });
}

/**
 * Validates a payload with the event's Standard Schema.
 * @param event - Event contract.
 * @param payload - Payload to publish.
 * @returns The validated value.
 * @throws TypeError listing the schema issues.
 */
async function validated<Input>(
  event: EventDescriptor<string, number, Input>,
  payload: Input,
): Promise<Input> {
  const result = await event.input["~standard"].validate(payload);
  if (result.issues !== undefined)
    throw new TypeError(
      `Event ${event.id} payload is invalid: ${result.issues.map((issue) => issue.message).join("; ")}`,
    );
  return result.value as Input;
}

/**
 * Builds the outbox-and-fan-out statement, mirroring the provider's publish SQL.
 * @param tables - Namespace tables.
 * @param profile - Event profile.
 * @param envelope - Envelope to persist.
 * @returns The Drizzle SQL statement.
 */
function statement(
  tables: ReturnType<typeof postgresTables>,
  profile: string,
  envelope: UnknownEventEnvelope,
): SQL {
  return sql`with outbox as (
      insert into ${sql.raw(tables.eventOutbox)} (instance_id, profile, event_id, version, envelope)
      values (${envelope.instanceId}, ${profile}, ${envelope.eventId}, ${envelope.version},
        ${JSON.stringify(envelope)}::text::jsonb)
      returning instance_id)
    insert into ${sql.raw(tables.eventDeliveries)} (instance_id, profile, trigger_id)
    select outbox.instance_id, consumer.profile, consumer.trigger_id
    from outbox, ${sql.raw(tables.eventConsumers)} as consumer
    where consumer.profile = ${profile} and consumer.event_id = ${envelope.eventId}
      and consumer.version = ${envelope.version}`;
}
