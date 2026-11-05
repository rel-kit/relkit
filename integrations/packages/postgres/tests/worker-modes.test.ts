/**
 * Both worker modes on a real database. In the web process (`worker` role,
 * the default) one instance submits, executes and delivers. In the separate
 * worker role, an `api`-role instance only submits and publishes, and a child
 * process started with `RELKIT_WORKER_ROLE=worker` does all the work.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { RunHandle } from "relkit/contracts/jobs";
import type { PostgresEventProvider, PostgresJobsRuntime } from "../src/runtime/index.js";
import { runtimeIntegration, workerRole } from "../src/runtime/integration.js";
import { contextFor, eventually, recordingExecutor, submission } from "./jobs-fixtures.js";
import { acquirePostgres, postgresAvailable } from "./postgres-harness.js";

const postgres = postgresAvailable ? await acquirePostgres() : undefined;
afterAll(async () => postgres?.close());
const publish = {
  operation: "publish" as const,
  eventId: "orders.placed",
  version: 1,
  profile: "default",
  signal: new AbortController().signal,
};

async function providers(role: "api" | "worker") {
  const previous = process.env.RELKIT_WORKER_ROLE;
  process.env.RELKIT_WORKER_ROLE = role;
  try {
    const context = (capability: string) => ({
      generationId: "generation.test",
      bindingId: `provider.${capability}.default`,
      capability,
      profile: "default",
      behavior: { native: { pollIntervalMs: 20 } },
      connection: { url: postgres!.url },
    });
    const [jobs, events] = runtimeIntegration.registrations;
    const job = await jobs!.create(context("job"));
    const event = await events!.create(context("event"));
    return {
      jobs: job.value as PostgresJobsRuntime,
      events: event.value as PostgresEventProvider,
      close: async () => {
        await job.release?.();
        await event.release?.();
      },
    };
  } finally {
    if (previous === undefined) delete process.env.RELKIT_WORKER_ROLE;
    else process.env.RELKIT_WORKER_ROLE = previous;
  }
}

test("reads the process role", () => {
  expect(workerRole(undefined)).toBe("worker");
  expect(workerRole("api")).toBe("api");
  expect(() => workerRole("web")).toThrow(TypeError);
});

describe.skipIf(postgres === undefined)("Postgres worker modes", () => {
  test("the web process runs jobs and event consumers itself", async () => {
    const web = await providers("worker");
    try {
      const delivered: string[] = [];
      await web.events.registerTrigger({
        id: "orders.inline",
        eventId: "orders.placed",
        eventVersion: 1,
        delivery: "durable",
        invoke: async (envelope) => void delivered.push(envelope.instanceId),
      });
      const { executor, calls } = recordingExecutor();
      web.jobs.startWorkers({ executor });
      const run = (await web.jobs.submit(submission("inline"), contextFor("default"))) as RunHandle;
      const event = await web.events.publish({ orderId: "inline" }, {}, publish);
      await eventually(async () => calls.length === 1 && delivered.length === 1);
      expect(calls[0]?.runId).toBe(run.runId);
      expect(delivered).toEqual([event.instanceId]);
    } finally {
      await web.close();
    }
  });

  test("an api-role instance leaves the work to a separate worker process", async () => {
    await postgres!.query(`create table role_effects (kind text, ref text, pid integer)`);
    const api = await providers("api");
    await api.events.registerTrigger({
      id: "orders.notify",
      eventId: "orders.placed",
      eventVersion: 1,
      delivery: "durable",
      invoke: async () => {
        throw new Error("api-role instances must not consume");
      },
    });
    const worker = Bun.spawn(
      ["bun", join(import.meta.dir, "fixtures/worker-role.ts"), postgres!.url],
      {
        env: { ...process.env, RELKIT_WORKER_ROLE: "worker" },
        stdout: "pipe",
        stderr: "inherit",
      },
    );
    try {
      const run = (await api.jobs.submit(
        submission("separate"),
        contextFor("default"),
      )) as RunHandle;
      const event = await api.events.publish({ orderId: "separate" }, {}, publish);
      await eventually(
        async () => (await postgres!.query(`select 1 from role_effects`)).length === 2,
        20_000,
      );
      const rows = await postgres!.query(`select kind, ref, pid from role_effects order by kind`);
      expect(rows).toEqual([
        { kind: "event", ref: event.instanceId, pid: worker.pid },
        { kind: "job", ref: run.runId, pid: worker.pid },
      ]);
      await eventually(
        async () => (await api.jobs.get(run.runId, contextFor("default"))).status === "completed",
      );
    } finally {
      worker.kill("SIGTERM");
      await worker.exited;
      await api.close();
    }
  }, 30_000);
});
