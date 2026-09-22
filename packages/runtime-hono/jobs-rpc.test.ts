import { afterEach, expect, test } from "bun:test";
import { createClient, createWebSocketClient } from "@relkit/client";
import { defineJob, defineTask, createJobsRuntime, type JobsAdapterRuntime } from "@relkit/jobs";
import type { RegistrationPlan } from "@relkit/graph";
import { z } from "@relkit/schema";
import { createApp, type RuntimeManifest } from "./src/index.ts";
import { runtimeCohort } from "./test-cohort.ts";
import { upgradeWebSocket, websocket } from "hono/bun";

const servers: Bun.Server<unknown>[] = [];

afterEach(() => {
  servers.splice(0).forEach((server) => server.stop(true));
});

test("uses one projected jobs router for HTTP and WebSocket", async () => {
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
  const identity = { identityScope: "viewer", sessionEpoch: "session" };
  const client = createClient<any>({
    baseUrl: "http://relkit.test",
    headers: {
      "x-relkit-jobs-protocol": "1",
      "x-relkit-public-fingerprint": "sha256:jobs",
    },
    fetch: (request, init) => app.fetch(new Request(request, init)),
  });

  const accepted = await client.jobs.exportOrders.trigger({
    input: "7",
    expectedIdentity: identity,
  });
  expect(accepted).toMatchObject({ accepted: true, runId: "run-1", jobId: "orders.export" });
  expect(submittedInput).toBe(7);
  expect(
    await client.jobs.exportOrders.runs.get({ runId: "run-1", expectedIdentity: identity }),
  ).toEqual(
    expect.objectContaining({ input: 7, output: { url: "https://example.test/export.csv" } }),
  );
  const page = await client.jobs.exportOrders.runs.list({
    expectedIdentity: identity,
    query: { limit: 1 },
  });
  expect(page.items[0]).toEqual(expect.objectContaining({ input: 7, progress: { completed: 1 } }));
  expect(page.items[0]).not.toHaveProperty("scope");
  expect(page.nextCursor).toEqual(expect.any(String));
  await client.jobs.exportOrders.runs.list({
    expectedIdentity: identity,
    query: { limit: 1, cursor: page.nextCursor },
  });
  expect(nativeListCursor).toBe("native-1");

  const server = Bun.serve({
    port: 0,
    websocket,
    fetch: (request, bunServer) => app.fetch(request, bunServer),
  });
  servers.push(server);
  const socketClient = createWebSocketClient<any>({
    baseUrl: `http://127.0.0.1:${server.port}`,
    headers: { "x-relkit-jobs-protocol": "1", "x-relkit-public-fingerprint": "sha256:jobs" },
  });
  const socketAccepted = await socketClient.jobs.exportOrders.trigger({
    input: "8",
    expectedIdentity: identity,
  });
  expect(socketAccepted).toMatchObject({ accepted: true, runId: "run-1" });
  expect(submittedInput).toBe(8);
  const socketRun = await socketClient.jobs.exportOrders.runs.get({
    runId: "run-1",
    expectedIdentity: identity,
  });
  expect(socketRun).toMatchObject({ runId: "run-1", status: "completed" });

  const staleSocket = createWebSocketClient<any>({
    baseUrl: `http://127.0.0.1:${server.port}`,
    headers: { "x-relkit-jobs-protocol": "1", "x-relkit-public-fingerprint": "sha256:old" },
  });
  await expect(
    staleSocket.jobs.exportOrders.runs.get({ runId: "run-1", expectedIdentity: identity }),
  ).rejects.toMatchObject({
    code: "RELKIT_JOB_PUBLIC_CONTRACT_STALE",
  });

  const stale = createClient<any>({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-jobs-protocol": "1", "x-relkit-public-fingerprint": "sha256:old" },
    fetch: (request, init) => app.fetch(new Request(request, init)),
  });
  await expect(
    stale.jobs.exportOrders.runs.get({ runId: "run-1", expectedIdentity: identity }),
  ).rejects.toMatchObject({
    code: "RELKIT_JOB_PUBLIC_CONTRACT_STALE",
  });
  await expect(
    client.jobs.hiddenJob.trigger({ input: "7", expectedIdentity: identity }),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

function fakeAdapter(
  onSubmit: (request: Parameters<JobsAdapterRuntime["submit"]>[0]) => void,
  onList: (query: Parameters<JobsAdapterRuntime["list"]>[0]) => void,
): JobsAdapterRuntime {
  return {
    kind: "jobs-adapter-runtime",
    protocolVersion: 1,
    capabilities: {
      service: "local",
      protocolVersion: 1,
      features: { submission: true, read: true, list: true, observation: true, cancel: true },
    },
    submit: async (request) => {
      onSubmit(request);
      return {
        accepted: true,
        runId: "run-1",
        jobId: request.jobId,
        taskId: request.taskId,
        taskVersion: request.taskVersion,
        acceptedAt: "2026-01-01T00:00:00.000Z",
      };
    },
    get: async () => runSnapshot(),
    list: async (query) => {
      onList(query);
      return {
        items: [runSnapshot()],
        nextCursor: "native-1",
        hasMore: true,
        availability: [{ service: "local", state: "available" }],
      };
    },
    observe: async function* () {
      yield {
        kind: "snapshot",
        run: runSnapshot(),
        observedAt: "2026-01-01T00:00:00.000Z",
        epoch: "epoch-1",
        sequence: 1,
        continuity: "state",
      };
    },
    cancel: async () => ({
      runId: "run-1",
      operationId: "operation-1",
      outcome: "already-terminal",
      run: runSnapshot(),
    }),
    close: async () => {},
  };
}

function runSnapshot() {
  return {
    accepted: true as const,
    runId: "run-1",
    jobId: "orders.export",
    taskId: "orders.export",
    taskVersion: "1",
    acceptedAt: "2026-01-01T00:00:00.000Z",
    buildId: "1",
    service: "local",
    scope: "public:fixture",
    status: "completed" as const,
    observedAt: "2026-01-01T00:00:01.000Z",
    resultAvailability: "available" as const,
    input: 7,
    progress: { completed: 1 },
    output: { url: "https://example.test/export.csv" },
  };
}

function jobPlan(job: ReturnType<typeof defineJob>): RegistrationPlan {
  return {
    graphHash: "sha256:jobs",
    functions: [],
    httpTriggers: [],
    tasks: [],
    jobs: [
      {
        kind: "job",
        id: job.id,
        source: { file: "job.ts", line: 1, column: 1 },
        executionModel: "task",
        name: job.name,
        jobId: job.id,
        taskId: job.task.ref.id,
        taskVersion: job.task.version,
        profile: "local",
        implicit: false,
        default: true,
        input: { type: "string" },
        output: { type: "object", properties: { url: { type: "string" } } },
        progress: { type: "object", properties: { completed: { type: "number" } } },
        client: {
          public: true,
          operations: ["trigger", "get", "list", "watch"],
          fields: ["status", "input", "output", "progress"],
        },
      },
    ],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
    channels: [],
    middlewares: [],
  };
}

function manifest(plan: RegistrationPlan, job: ReturnType<typeof defineJob>): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    middleware: {},
    requestTransforms: {},
    jobs: { [job.id]: job },
  };
}
