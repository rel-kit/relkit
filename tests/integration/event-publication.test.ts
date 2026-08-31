import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEventClient, defineEvent } from "../../packages/events/src/index.ts";
import { createLocalEventProvider } from "../../packages/providers-local/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";

test("publication accepts zero consumers and does not wait for independent consumers", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-event-publication-"));
  const provider = await createLocalEventProvider(root);
  const gate = Promise.withResolvers<void>();
  const healthy = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const event = defineEvent({ id: "created", input: z.object({ id: z.string() }) });
  const client = createEventClient({
    ownerId: "publisher",
    eventId: event.id,
    version: event.version,
    source: provider,
    payloadSchema: event.input,
  });
  const timeout = AbortSignal.timeout(1_000);
  const expired = new Promise<never>((_, reject) =>
    timeout.addEventListener(
      "abort",
      () => reject(new Error("publication waited for a consumer")),
      { once: true },
    ),
  );
  try {
    expect(await client.publish({ id: "no_consumers" })).toMatchObject({ accepted: true });
    await provider.registerTrigger({
      id: "slow",
      targetFunctionId: "slow_consumer",
      eventId: "created",
      eventVersion: 1,
      delivery: "durable",
      invoke: async () => {
        started.resolve();
        await gate.promise;
      },
    });
    await provider.registerTrigger({
      id: "healthy",
      targetFunctionId: "healthy_consumer",
      eventId: "created",
      eventVersion: 1,
      delivery: "durable",
      invoke: async () => {
        healthy.resolve();
      },
    });
    expect(await Promise.race([client.publish({ id: "fanout" }), expired])).toMatchObject({
      accepted: true,
    });
    await Promise.race([Promise.all([started.promise, healthy.promise]), expired]);
    expect(gate.promise).toBeInstanceOf(Promise);
  } finally {
    gate.resolve();
    await provider.close();
    await rm(root, { recursive: true, force: true });
  }
});
