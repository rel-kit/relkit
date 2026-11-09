/**
 * The Postgres event provider. Registering a durable trigger records its
 * consumer row; `publish` persists the envelope and one delivery per consumer
 * in a single statement; consumer loops lease due deliveries with
 * `FOR UPDATE SKIP LOCKED`, invoke the trigger, and complete, retry or
 * dead-letter each delivery on its own under the trigger's retry policy.
 * Delivery is at least once: a consumer that crashes after its handler
 * succeeded is invoked again when its lease expires.
 */
import type { JsonValue } from "relkit/contracts";
import { planRetry } from "relkit/providers-local";
import type { RetryPolicy } from "relkit/jobs";
import { Effect, Fiber } from "effect";
import { createEventEnvelope } from "../events-envelope.js";
import { openPostgresDatabase } from "./database.js";
import type { BackgroundFiber } from "./database.types.js";
import { forkWorkerLoop } from "./jobs-loops.js";
import { leaseDelivery, publishEvent, registerConsumer, settleDelivery } from "./events-store.js";
import type {
  PostgresEventProvider,
  PostgresEventProviderOptions,
  PostgresEventTrigger,
} from "./events-provider.types.js";
export type * from "./events-provider.types.js";

const SINGLE_ATTEMPT: RetryPolicy = {
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none",
};

/**
 * Creates the Postgres event provider for one profile.
 * @param options - Connection (or shared database), profile, lease and consumer settings.
 * @returns The provider; `close()` stops consumer loops and, unless shared, the pool.
 * @throws TypeError when neither `url` nor `database` is given.
 * @example const events = createPostgresEventProvider({ url: process.env.DATABASE_URL! });
 * @experimental
 */
export function createPostgresEventProvider(
  options: PostgresEventProviderOptions,
): PostgresEventProvider {
  if (options.database === undefined && options.url === undefined)
    throw new TypeError("Postgres events need a url or a database");
  const database = options.database ?? openPostgresDatabase({ ...options, url: options.url! });
  const profile = options.profile ?? "default";
  const leaseMs = options.leaseMs ?? 30_000;
  const workerId = options.workerId ?? `postgres-events-${crypto.randomUUID().slice(0, 8)}`;
  const triggers = new Map<string, PostgresEventTrigger>();
  let loop: BackgroundFiber | undefined;
  const deliverOne = (trigger: PostgresEventTrigger) =>
    deliver(database, profile, trigger, `${workerId}:${crypto.randomUUID()}`, leaseMs);
  const deliverDue = async () => {
    const durable = [...triggers.values()].filter((trigger) => trigger.delivery === "durable");
    const results = await Promise.all(durable.map(deliverOne));
    return results.filter(Boolean).length;
  };
  const startConsumers = () => {
    loop ??= forkWorkerLoop(
      database,
      async () => (await deliverDue()) > 0,
      options.pollIntervalMs ?? 1_000,
    );
  };
  const provider: PostgresEventProvider = {
    database,
    registerContract: async () => undefined,
    registerTrigger: async (binding) => {
      triggers.set(binding.id, binding);
      if (binding.delivery !== "durable") return;
      await database.run(
        registerConsumer(database.tables, profile, {
          triggerId: binding.id,
          eventId: binding.eventId,
          version: binding.eventVersion,
        }),
      );
      if (options.consumers !== false) startConsumers();
    },
    publish: async (payload, publishOptions, context) => {
      const envelope = createEventEnvelope(
        context.eventId,
        context.version,
        payload,
        publishOptions,
        context.propagation,
      );
      await database.run(publishEvent(database.tables, profile, envelope), context.signal);
      for (const trigger of triggers.values())
        if (trigger.delivery === "ephemeral" && trigger.eventId === envelope.eventId)
          void trigger.invoke(envelope).catch(() => undefined);
      return { accepted: true as const, ...envelope };
    },
    deliverDue,
    startConsumers,
    close: async () => {
      if (loop !== undefined) await Effect.runPromise(Fiber.interrupt(loop));
      if (options.database === undefined) await database.close();
    },
  };
  return Object.freeze(provider);
}

/**
 * Leases, invokes and settles one due delivery of a durable trigger.
 * @param database - Connection owner.
 * @param profile - Event profile.
 * @param trigger - Consumer.
 * @param owner - Fresh owner token.
 * @param leaseMs - Lease duration.
 * @returns True when a delivery was attempted.
 */
async function deliver(
  database: PostgresEventProvider["database"],
  profile: string,
  trigger: PostgresEventTrigger,
  owner: string,
  leaseMs: number,
): Promise<boolean> {
  const tables = database.tables;
  const row = await database.run(leaseDelivery(tables, profile, trigger.id, owner, leaseMs));
  if (row === undefined) return false;
  try {
    await trigger.invoke(row.envelope, { replayed: row.attempt > 1 });
    await database.run(settleDelivery(tables, row, owner, { state: "completed" }));
  } catch (error) {
    const plan = planRetry(retryPolicy(trigger.retry), row.attempt, error);
    const state = plan.state === "delayed" ? "delayed" : "dead-lettered";
    await database.run(
      settleDelivery(tables, row, owner, { state, delayMs: plan.delayMs, failure: plan.failure }),
    );
  }
  return true;
}

/**
 * Reads a trigger's retry policy; triggers without one get a single attempt.
 * @param value - Authored retry policy.
 * @returns A complete retry policy.
 */
function retryPolicy(value: JsonValue | undefined): RetryPolicy {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return SINGLE_ATTEMPT;
  const record = value as Partial<Record<keyof RetryPolicy, JsonValue>>;
  const number = (candidate: JsonValue | undefined, fallback: number) =>
    typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
  const initialDelayMs = number(record.initialDelayMs, 0);
  return {
    maxAttempts: Math.max(1, Math.floor(number(record.maxAttempts, 1))),
    initialDelayMs,
    maxDelayMs: Math.max(initialDelayMs, number(record.maxDelayMs, initialDelayMs)),
    multiplier: Math.max(1, number(record.multiplier, 1)),
    jitter: record.jitter === "full" || record.jitter === "equal" ? record.jitter : "none",
  };
}
