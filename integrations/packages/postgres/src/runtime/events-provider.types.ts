/** Contracts of the Postgres event provider: options, trigger bindings and the provider surface. */
import type { JsonValue } from "relkit/contracts";
import type { EventProvider, UnknownEventEnvelope } from "relkit/events";
import type { PostgresDatabase, PostgresDatabaseOptions } from "./database.types.js";

/** The trigger binding the runtime registers for each event-only function. @experimental */
export interface PostgresEventTrigger {
  readonly id: string;
  readonly eventId: string;
  readonly eventVersion: number;
  /** `durable` triggers get persisted deliveries; `ephemeral` ones run in-process after publish. */
  readonly delivery: "durable" | "ephemeral";
  /** Retry policy: `maxAttempts`, `initialDelayMs`, `maxDelayMs`, `multiplier`, `jitter`. */
  readonly retry?: JsonValue;
  readonly timeoutMs?: number;
  readonly invoke: (
    envelope: UnknownEventEnvelope,
    options?: { readonly replayed?: boolean; readonly deadlineMs?: number },
  ) => Promise<JsonValue | void | object>;
}

/** Options for `createPostgresEventProvider`. @experimental */
export interface PostgresEventProviderOptions extends Partial<PostgresDatabaseOptions> {
  /** Shared connection owner; when given, `url` is ignored and `close()` leaves it open. */
  readonly database?: PostgresDatabase;
  /** Event provider profile; consumers and deliveries are namespaced by it. Defaults to `default`. */
  readonly profile?: string;
  /** Delivery lease duration in ms; defaults to 30 000. */
  readonly leaseMs?: number;
  /** Idle polling interval of consumer loops in ms; defaults to 1 000. */
  readonly pollIntervalMs?: number;
  /** Run consumer loops in this instance; false for `api`-role instances. Defaults to true. */
  readonly consumers?: boolean;
  /** Prefix of delivery owner tokens. */
  readonly workerId?: string;
}

/** The Postgres event provider. @experimental */
export interface PostgresEventProvider extends EventProvider {
  readonly database: PostgresDatabase;
  readonly registerContract: (contract: object) => Promise<void>;
  readonly registerTrigger: (binding: PostgresEventTrigger) => Promise<void>;
  /** Runs at most one due delivery per durable consumer; resolves the number delivered. */
  readonly deliverDue: () => Promise<number>;
  /** Starts the consumer loop; idempotent. */
  readonly startConsumers: () => void;
  readonly close: () => Promise<void>;
}
