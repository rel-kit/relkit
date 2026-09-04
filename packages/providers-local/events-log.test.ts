import { afterEach, describe, expect, test } from "bun:test";
import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEventLog } from "./src/events/log.ts";

const roots: string[] = [];

describe("local durable event log", () => {
  test("persists accepted envelopes before acknowledgement and reopens them", async () => {
    const root = await makeRoot();
    const log = await createEventLog(root, { now: () => 1_000 });
    const envelope = makeEnvelope();
    const record = await log.append(envelope);

    expect(record).toMatchObject({ version: 1, sequence: 1, kind: "accepted", accepted: true });
    expect(record.envelope).toEqual(envelope);
    expect(JSON.parse((await readFile(join(root, "records.ndjson"), "utf8")).trim())).toMatchObject(
      {
        version: 1,
        sequence: 1,
        kind: "accepted",
        data: envelope,
      },
    );
    await log.close();

    const reopened = await createEventLog(root);
    expect(reopened.snapshot().records).toHaveLength(1);
    expect(reopened.snapshot().checkpoint.recordCount).toBe(1);
    await reopened.close();
  });

  test("does not acknowledge before the durable record boundary", async () => {
    const root = await makeRoot();
    const log = await createEventLog(root, {
      onBoundary: (boundary) => {
        if (boundary === "record-fsynced") throw new Error("injected event fsync failure");
      },
    });

    await expect(log.append(makeEnvelope())).rejects.toThrow("injected event fsync failure");
    await log.close();
    const reopened = await createEventLog(root);
    expect(reopened.snapshot().records.map(({ envelope }) => envelope.instanceId)).toEqual([
      "event-1",
    ]);
    await reopened.close();
  });

  test("repairs metadata and quarantines malformed event records", async () => {
    const root = await makeRoot();
    const log = await createEventLog(root);
    await log.append(makeEnvelope());
    await log.close();
    await appendFile(
      join(root, "records.ndjson"),
      `${JSON.stringify({
        version: 1,
        sequence: 2,
        instanceId: "event-bad",
        kind: "accepted",
        timestamp: 1_001,
        data: { eventId: "orders.created" },
      })}\n`,
    );
    await writeFile(join(root, "checkpoint.json"), "not-json");

    const reopened = await createEventLog(root);
    expect(reopened.snapshot().records).toHaveLength(1);
    expect(reopened.snapshot().checkpoint.commit).toBe(1);
    expect(await readdir(join(root, ".relkit-quarantine"))).toHaveLength(2);
    await reopened.close();
  });
});

function makeEnvelope() {
  return {
    instanceId: "event-1",
    eventId: "orders.created",
    version: 1,
    payload: { orderId: "order-1", totalCents: 100 },
    occurredAt: "2026-08-15T00:00:00.000Z",
    publishedAt: "2026-08-15T00:00:01.000Z",
    propagation: {
      version: 2,
      producer: {
        traceId: "10000000000000000000000000000001",
        spanId: "1000000000000001",
        traceFlags: 1,
        remote: true,
      },
      correlationId: "request-1",
      invocationId: "invocation-1",
    },
    attributes: { source: "checkout" },
  } as const;
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-events-"));
  roots.push(root);
  return join(root, "events");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
