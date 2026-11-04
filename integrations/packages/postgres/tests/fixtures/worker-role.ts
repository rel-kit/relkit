/**
 * A separate worker-role process for the worker-mode test. It builds the jobs
 * and events providers through the runtime integration exactly as the
 * generated server does, runs job workers and event consumers, and records
 * every executed job and delivered event in `role_effects` with its PID.
 * Usage: `bun worker-role.ts <database-url>`; it exits on SIGTERM.
 */
import { SQL } from "bun";
import { runtimeIntegration } from "../../src/runtime/integration.js";
import type { PostgresEventProvider, PostgresJobsRuntime } from "../../src/runtime/index.js";

const url = process.argv[2]!;
const effects = new SQL(url);
const context = (capability: string) => ({
  generationId: "generation.worker",
  bindingId: `provider.${capability}.default`,
  capability,
  profile: "default",
  behavior: { native: { pollIntervalMs: 20 } },
  connection: { url },
});
const [jobs, events] = runtimeIntegration.registrations;
const jobsCreated = await jobs!.create(context("job"));
const eventsCreated = await events!.create(context("event"));
const runtime = jobsCreated.value as PostgresJobsRuntime;
const provider = eventsCreated.value as PostgresEventProvider;
await provider.registerTrigger({
  id: "orders.notify",
  eventId: "orders.placed",
  eventVersion: 1,
  delivery: "durable",
  invoke: async (envelope) => {
    await effects`insert into role_effects (kind, ref, pid) values ('event', ${envelope.instanceId}, ${process.pid})`;
  },
});
const handle = runtime.registerWorker({
  definitions: [],
  executor: { execute: async () => null },
  startWorker: true,
});
await handle.ready();
runtime.startWorkers({
  executor: {
    execute: async (envelope) => {
      await effects`insert into role_effects (kind, ref, pid) values ('job', ${envelope.runId}, ${process.pid})`;
      return { worker: process.pid };
    },
  },
});
console.log("worker-ready");
process.on("SIGTERM", async () => {
  await jobsCreated.release?.();
  await eventsCreated.release?.();
  await effects.close();
  process.exit(0);
});
