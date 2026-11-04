/** Contracts of the Drizzle transactional outbox. */
import type { SQL } from "drizzle-orm";
import type { EventDescriptor, EventPublishOptions, UnknownEventEnvelope } from "relkit/events";
import type { PostgresTableOptions } from "../schema.types.js";

/** Anything with Drizzle's `execute(sql)`: a Postgres database or transaction. @experimental */
export interface OutboxTransaction<Result> {
  readonly execute: (query: SQL) => PromiseLike<Result>;
}

/** Outbox settings; they must match the event provider's profile and tables. @experimental */
export interface OutboxOptions extends PostgresTableOptions {
  /** Event profile used when the event contract names none; defaults to `default`. */
  readonly profile?: string;
}

/** The outbox bound to one transaction. @experimental */
export interface PostgresOutbox {
  /**
   * Writes one event on the bound transaction.
   * @param event - Event contract; the payload is validated against its schema.
   * @param payload - Event payload.
   * @param options - Optional ordering key and attributes.
   * @returns The persisted envelope; consumers see it only if the transaction commits.
   */
  readonly publish: <Id extends string, Version extends number, Input>(
    event: EventDescriptor<Id, Version, Input>,
    payload: Input,
    options?: EventPublishOptions,
  ) => Promise<UnknownEventEnvelope & { readonly eventId: Id; readonly version: Version }>;
}
