import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localEvent, localJob } from "./src/index.ts";
import { runtimeIntegration } from "./src/runtime/index.ts";

test("publishes matching local event and job adapters", () => {
  expect(localEvent()).toMatchObject({
    integration: { integrationId: "local" },
    capability: { id: "event" },
    adapterId: "local-event",
  });
  expect(localJob({ root: ".state" })).toMatchObject({
    capability: { id: "job" },
    adapterId: "local-job",
    connection: { root: ".state" },
  });
  expect(() => localEvent({ root: " " })).toThrow("non-empty path");
});

test("registers durable local event and unscheduled job runtimes", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-local-providers-"));
  try {
    const [eventRegistration, jobRegistration] = runtimeIntegration.registrations;
    const context = {
      generationId: "generation.test",
      bindingId: "provider.test.default",
      profile: "default",
      behavior: {},
      connection: { root },
    } as const;
    const event = await eventRegistration!.create({ ...context, capability: "event" });
    const job = await jobRegistration!.create({ ...context, capability: "job" });

    expect(event.value).toMatchObject({
      registerContract: expect.any(Function),
      registerTrigger: expect.any(Function),
    });
    expect(job.value).toMatchObject({ createQueue: expect.any(Function) });

    await event.release?.();
    await job.release?.();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
