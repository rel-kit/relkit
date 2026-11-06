/**
 * Durable Postgres events on a real database: per-consumer retries when one
 * consumer fails, dead-lettering, at-least-once redelivery after a consumer
 * crash, and the Drizzle outbox committing or discarding events together with
 * the transaction's other writes, including when a later statement fails.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sql/postgres";
import { sql } from "drizzle-orm";
import { defineEvent } from "relkit/events";
import { applicationFailure } from "relkit/invocation";
import { z } from "relkit/schema";
import { outbox } from "../src/drizzle/index.js";
import {
  createPostgresEventProvider,
  type PostgresEventProvider,
  type PostgresEventTrigger,
} from "../src/runtime/index.js";
import { leaseDelivery } from "../src/runtime/events-store.js";
import { acquirePostgres, postgresAvailable } from "./postgres-harness.js";

const postgres = postgresAvailable ? await acquirePostgres() : undefined;
afterAll(async () => postgres?.close());
const open: PostgresEventProvider[] = [];
afterEach(async () => void (await Promise.all(open.splice(0).map((provider) => provider.close()))));

const orderPlaced = defineEvent({ id: "orders.placed", input: z.object({ orderId: z.string() }) });
const quickRetry = {
  maxAttempts: 3,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none",
};
const context = {
  operation: "publish" as const,
  eventId: "orders.placed",
  version: 1,
  signal: new AbortController().signal,
};

function provider(profile: string, leaseMs = 30_000): PostgresEventProvider {
  const created = createPostgresEventProvider({
    url: postgres!.url,
    profile,
    leaseMs,
    consumers: false,
    maxConnections: 3,
  });
  open.push(created);
  return created;
}

function consumer(id: string, invoke: PostgresEventTrigger["invoke"]): PostgresEventTrigger {
  return {
    id,
    eventId: "orders.placed",
    eventVersion: 1,
    delivery: "durable",
    retry: quickRetry,
    invoke,
  };
}

async function drain(events: PostgresEventProvider): Promise<void> {
  while ((await events.deliverDue()) > 0);
}

describe.skipIf(postgres === undefined)("Postgres events", () => {
  test("only the failed consumer's delivery is retried", async () => {
    const events = provider("partial");
    const calls: string[] = [];
    let failed = false;
    await events.registerTrigger(
      consumer("email", async (envelope) => void calls.push(`email:${envelope.instanceId}`)),
    );
    await events.registerTrigger(
      consumer("invoice", async (envelope) => {
        calls.push(`invoice:${envelope.instanceId}`);
        if (!failed) {
          failed = true;
          throw applicationFailure({
            id: "invoice.down",
            message: "later",
            data: null,
            retry: "later",
          });
        }
      }),
    );
    const published = await events.publish(
      { orderId: "o-1" },
      {},
      { ...context, profile: "partial" },
    );
    await drain(events);
    expect(calls.filter((call) => call.startsWith("email"))).toEqual([
      `email:${published.instanceId}`,
    ]);
    expect(calls.filter((call) => call.startsWith("invoice"))).toHaveLength(2);
  });

  test("a delivery that fails without retry is dead-lettered", async () => {
    const events = provider("dead");
    await events.registerTrigger(
      consumer("audit", async () => {
        throw new Error("broken consumer");
      }),
    );
    await events.publish({ orderId: "o-2" }, {}, { ...context, profile: "dead" });
    await drain(events);
    const rows = await postgres!.query(
      `select status, attempt from relkit_event_deliveries where profile = 'dead'`,
    );
    expect(rows).toEqual([{ status: "dead-lettered", attempt: 1 }]);
  });

  test("a consumer that crashes after its handler succeeded is invoked again", async () => {
    const crashed = provider("crash", 100);
    const survivor = provider("crash", 100);
    const calls: string[] = [];
    const trigger = consumer("ship", async (envelope) => void calls.push(envelope.instanceId));
    await crashed.registerTrigger(trigger);
    await survivor.registerTrigger(trigger);
    await crashed.publish({ orderId: "o-3" }, {}, { ...context, profile: "crash" });
    const leased = await crashed.database.run(
      leaseDelivery(crashed.database.tables, "crash", "ship", "crashed-owner", 100),
    );
    await trigger.invoke(leased!.envelope);
    await Bun.sleep(150);
    await drain(survivor);
    expect(calls).toEqual([leased!.envelope.instanceId, leased!.envelope.instanceId]);
  });

  test("the outbox commits and rolls back with the caller's Drizzle transaction", async () => {
    const events = provider("default");
    const calls: string[] = [];
    await events.registerTrigger(
      consumer(
        "notify",
        async (envelope) => void calls.push((envelope.payload as { orderId: string }).orderId),
      ),
    );
    const db = drizzle(postgres!.url);
    await db.execute(sql`create table if not exists orders (id text primary key)`);
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`insert into orders (id) values ('rolled-back')`);
        await outbox(tx).publish(orderPlaced, { orderId: "rolled-back" });
        throw new Error("handler failed after publishing");
      }),
    ).rejects.toThrow("handler failed after publishing");
    await expect(
      db.transaction(async (tx) => {
        await outbox(tx).publish(orderPlaced, { orderId: "duplicate" });
        await tx.execute(sql`insert into orders (id) values ('dup')`);
        await tx.execute(sql`insert into orders (id) values ('dup')`);
      }),
    ).rejects.toThrow();
    await db.transaction(async (tx) => {
      await tx.execute(sql`insert into orders (id) values ('committed')`);
      await outbox(tx).publish(orderPlaced, { orderId: "committed" });
    });
    await drain(events);
    expect(calls).toEqual(["committed"]);
    const orders = await postgres!.query(`select id from orders order by id`);
    expect(orders).toEqual([{ id: "committed" }]);
    await expect(outbox(db).publish(orderPlaced, { orderId: 1 } as never)).rejects.toThrow(
      TypeError,
    );
    await db.$client.close();
  });
});
