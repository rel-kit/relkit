import { defineJob, defineTask, createJobsRuntime } from "@relkit/jobs";

import { z } from "@relkit/schema";
import { createApp } from "../../src/index.ts";

import { upgradeWebSocket, websocket } from "hono/bun";

import { fakeAdapter, jobPlan, manifest } from "./jobs-setup.ts";
const task = defineTask({
  id: "orders.export",
  version: "1",
  input: z.string().transform(Number),
  inputWire: z.number(),
  output: z.object({ url: z.string() }),
  progress: z.object({ completed: z.number() }),
  handler: async () => ({ url: "https://example.test/export.csv" }),
});
const job = defineJob({
  name: "exportOrders",
  id: "orders.export",
  task,
  client: {
    public: true,
    operations: ["trigger", "get", "list", "watch"],
    fields: ["status", "input", "output", "progress"],
  },
});
let submittedInput: unknown;
let nativeListCursor: unknown;
const adapter = fakeAdapter(
  (request) => {
    submittedInput = request.input;
  },
  (query) => {
    nativeListCursor = query.cursor;
  },
);
const runtime = createJobsRuntime({
  adapter,
  application: "fixture",
  environment: "test",
  service: "local",
  jobs: [job],
  tasks: [task],
});
const plan = jobPlan(job);
const app = createApp({
  plan,
  manifest: manifest(plan, job),
  engine: { invoke: async () => ({}) },
  clientIdentity: {
    applicationId: "fixture",
    publicFingerprint: "sha256:jobs",
    jobs: { protocol: "relkit.jobs", version: 1 },
    resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
  },
  jobs: {
    runtimes: runtime,
    descriptors: { [job.id]: job },
    application: "fixture",
    environment: "test",
    publicFingerprint: "sha256:jobs",
    cursorSecret: "test-cursor-secret",
  },
  upgradeWebSocket,
});
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  websocket,
  fetch: (request, bunServer) =>
    new URL(request.url).pathname === "/__fixture/state"
      ? Response.json({ submittedInput, nativeListCursor })
      : app.fetch(request, bunServer),
});
process.send?.({ port: server.port });
process.once("SIGTERM", () => {
  server.stop(true);
  process.exit(0);
});
