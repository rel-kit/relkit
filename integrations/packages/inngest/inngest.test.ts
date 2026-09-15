import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { inngest } from "./src/index.ts";
import { localRecipe } from "./src/local.ts";
import { createInngestRuntime } from "./src/runtime/index.ts";
import { createInngestRunApi, snapshot } from "./src/runtime/runs.ts";
import { createInngestFunction, createInngestFunctionConfig } from "./src/runtime/task-binding.ts";

test("authoring stays pure and declares the native local recipe", () => {
  const adapter = inngest();
  expect(adapter.adapterId).toBe("inngest");
  expect(adapter.localRecipe).toEqual({ integrationId: "inngest", recipeId: "inngest-docker", recipeVersion: 2 });
  expect(localRecipe.containers?.map((unit) => unit.id)).toEqual(["postgres", "redis", "inngest"]);
  expect(localRecipe.workers?.map((unit) => unit.id)).toEqual(["worker"]);
  expect(localRecipe.init?.map((unit) => unit.id)).toEqual(["postgres-ready"]);
  expect(localRecipe.containers?.find((unit) => unit.id === "redis")?.command).toEqual([
    "redis-server",
    "--appendonly",
    "yes",
    "--appendfsync",
    "always",
  ]);
  expect(localRecipe.volumes).toMatchObject({
    postgres: { persistent: true },
    redis: { persistent: true },
  });
  expect(localRecipe.workers?.[0]?.image).toContain("@sha256:");
  expect(() => inngest({ appId: "" })).toThrow();
});

test("maps only certified native policy fields", () => {
  expect(createInngestFunctionConfig({
    functionId: "relkit-job-task-v1-build",
    eventName: "relkit/job/task/v1/build",
    policy: { retry: { maxAttempts: 3, initialDelay: "1 second", maxDelay: "30 seconds", factor: 2, jitter: "none" }, maxDuration: "2 seconds", concurrency: { limit: 2 } },
  })).toMatchObject({ retries: 2, timeouts: { finish: "2s" }, concurrency: { limit: 2, scope: "fn" } });
  expect(() => createInngestFunctionConfig({
    functionId: "relkit-job-task-v1-build",
    eventName: "relkit/job/task/v1/build",
    policy: { maxElapsed: "2 seconds" },
  })).toThrow("cannot certify");
});

test("maps only UTC cron schedules to native Docker triggers", () => {
  expect(createInngestFunctionConfig({
    functionId: "relkit-job-task-v1-build",
    eventName: "relkit/job/task/v1/build",
    schedules: [{ id: "hourly", cron: "0 * * * *", timezone: "UTC", input: { value: 1 } }],
  }).triggers).toEqual([
    { event: "relkit/job/task/v1/build" },
    { cron: "0 * * * *" },
  ]);
  expect(() => createInngestFunctionConfig({
    functionId: "relkit-job-task-v1-build",
    eventName: "relkit/job/task/v1/build",
    schedules: [{ id: "every", every: "1 minute", input: { value: 1 } }],
  })).toThrow("interval recurrence");
});

test("executes static cron triggers with the declared schedule input", async () => {
  let handler: ((context: unknown) => Promise<unknown>) | undefined;
  const client = {
    createFunction: (_config: unknown, value: (context: unknown) => Promise<unknown>) => {
      handler = value;
      return {};
    },
  } as never;
  let received: { readonly input: unknown; readonly occurrenceIdentity?: string } | undefined;
  createInngestFunction(client, {
    functionId: "relkit-job-task-v1-build-schedule-hourly",
    eventName: "relkit/job/task/v1/build",
    jobId: "job",
    taskId: "task",
    taskVersion: "1",
    buildId: "build",
    version: "1",
    schedule: { id: "hourly", cron: "0 * * * *", timezone: "UTC", input: { value: 1 } },
  }, { execute: async (envelope) => {
    received = { input: envelope.input, occurrenceIdentity: envelope.occurrenceIdentity };
    return { ok: true };
  } });
  await handler?.({
    runId: "run-1",
    attempt: 0,
    event: { id: "occurrence-1", name: "inngest/scheduled.timer", data: { cron: "0 * * * *" } },
    step: { sleep: async () => undefined, sleepUntil: async () => undefined },
  });
  expect(received).toEqual({ input: { version: 1, kind: "json", value: { value: 1 } }, occurrenceIdentity: "occurrence-1" });
});

test("registers a native serve endpoint with the injected task executor", async () => {
  const runtime = createInngestRuntime({
    appId: "relkit-test",
    baseUrl: "http://127.0.0.1:8288",
    eventKey: "event-key",
    signingKey: "signing-key",
    fetch: async () => Response.json({}),
  });
  const worker = runtime.registerWorker({
    definitions: [{ functionId: "relkit-job-task-v1-build", eventName: "relkit/job/task/v1/build" }],
    executor: { execute: async () => ({ ok: true }) },
  });
  const response = await worker.handler(new Request("http://127.0.0.1:3000/api/inngest", {
    method: "PUT",
    headers: { host: "127.0.0.1:3000" },
  }));
  expect(worker.path).toBe("/api/inngest");
  expect(response.ok).toBe(true);
  await worker.ready();
  await runtime.close();
});

test("submissions resolve event receipts without selecting an arbitrary run", async () => {
  let eventRuns = 0;
  const runtime = createInngestRuntime({
    appId: "relkit-test",
    baseUrl: "http://inngest.test",
    eventKey: "event-key",
    signingKey: "signing-key",
    fetch: async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") return Response.json({ ids: ["event-1"], status: 200 });
      if (url.includes("/events/")) {
        eventRuns += 1;
        return Response.json({ data: eventRuns === 1 ? [{ id: "run-1", status: "Completed", output: { ok: true } }] : [] });
      }
      return Response.json({ data: { id: "run-1", status: "Completed", output: { ok: true } } });
    },
  });
  const context = {
    signal: new AbortController().signal,
    application: "app",
    environment: "test",
    scope: "default",
    service: "inngest",
    serviceGeneration: "generation",
  } as const;
  const receipt = await runtime.submit({
    jobId: "job",
    taskId: "task",
    taskVersion: "1",
    buildId: "build",
    input: { value: 1 },
    operationId: "operation",
  }, context);
  expect(receipt).toMatchObject({ accepted: true, runId: "event:event-1" });
  const run = await runtime.get(receipt.runId, context);
  expect(run).toMatchObject({ runId: "run-1", status: "completed", resultAvailability: "available", output: { ok: true } });
  await runtime.close();
});

test("ambiguous event routing is surfaced as an error", async () => {
  const runtime = createInngestRuntime({
    appId: "relkit-test",
    baseUrl: "http://inngest.test",
    eventKey: "event-key",
    fetch: async (input, init) => init?.method === "POST"
      ? Response.json({ ids: ["event-1"], status: 200 })
      : Response.json({ data: [{ id: "one", status: "Running" }, { id: "two", status: "Running" }] }),
  });
  const context = { signal: new AbortController().signal, application: "app", environment: "test", scope: "default", service: "inngest", serviceGeneration: "generation" } as const;
  const receipt = await runtime.submit({ jobId: "job", taskId: "task", taskVersion: "1", buildId: "build", input: null, operationId: "operation" }, context);
  await expect(runtime.get(receipt.runId, context)).rejects.toThrow("matched multiple native runs");
  await runtime.close();
});

test("uses the acceptance identity for first-wins event submission", async () => {
  let submissions = 0;
  let payload: Record<string, any> | undefined;
  const runtime = createInngestRuntime({
    appId: "relkit-test",
    baseUrl: "http://inngest.test",
    eventKey: "event-key",
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      if (request.method === "POST") {
        submissions += 1;
        payload = JSON.parse(await request.text()) as Record<string, any>;
        return Response.json({ ids: ["native-1"], status: 200 });
      }
      return Response.json({ data: [] });
    },
  });
  const context = { signal: new AbortController().signal, application: "app", environment: "test", scope: "default", service: "inngest", serviceGeneration: "generation" } as const;
  const first = await runtime.submit({ jobId: "job", taskId: "task", taskVersion: "1", buildId: "build", input: { value: 1 }, operationId: "first", acceptanceIdentity: "accepted-once", tags: ["one"], correlationId: "correlation" }, context);
  const second = await runtime.submit({ jobId: "job", taskId: "task", taskVersion: "1", buildId: "build", input: { value: 2 }, operationId: "second", acceptanceIdentity: "accepted-once" }, context);
  expect(submissions).toBe(1);
  expect(second).toMatchObject({ accepted: true, runId: first.runId, duplicate: true });
  expect(payload?.[0]?.data.relkit).toMatchObject({ acceptanceIdentity: "accepted-once", tags: ["one"], correlationId: "correlation" });
  await runtime.close();
});

test("returns an unknown outcome when event transport acceptance is ambiguous", async () => {
  const runtime = createInngestRuntime({
    appId: "relkit-test",
    baseUrl: "http://inngest.test",
    eventKey: "event-key",
    fetch: async () => { throw new Error("network disconnected"); },
  });
  const context = { signal: new AbortController().signal, application: "app", environment: "test", scope: "default", service: "inngest", serviceGeneration: "generation" } as const;
  await expect(runtime.submit({ jobId: "job", taskId: "task", taskVersion: "1", buildId: "build", input: null, operationId: "operation" }, context)).resolves.toMatchObject({ code: "RELKIT_JOB_SUBMISSION_UNKNOWN", outcome: "unknown", recovery: { action: "retry-with-same-key" } });
  await runtime.close();
});

test("hashes signing keys for native API authorization and preserves null output", async () => {
  let authorization = "";
  const api = createInngestRunApi({
    baseUrl: "http://inngest.test",
    signingKey: "signkey-test-abcdef",
    fetch: async (_input, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({ data: { id: "run-1", status: "Completed", output: null } });
    },
  });
  const run = await api.run("run-1");
  expect(authorization).toBe(`Bearer signkey-test-${createHash("sha256").update(Buffer.from("abcdef", "hex")).digest("hex")}`);
  const metadata = {
    accepted: true,
    runId: "run-1",
    jobId: "job",
    taskId: "task",
    taskVersion: "1",
    acceptedAt: "2026-01-01T00:00:00.000Z",
    eventId: "event-1",
    buildId: "build",
    service: "inngest",
  } as const;
  expect(snapshot(run, metadata)).toMatchObject({ status: "completed", resultAvailability: "available", output: null });
});

test("memoizes terminal native retries and indexes the new run", async () => {
  let retryCalls = 0;
  const runtime = createInngestRuntime({
    appId: "relkit-test",
    baseUrl: "http://inngest.test",
    eventKey: "event-key",
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith("/e/event-key")) return Response.json({ ids: ["event-1"], status: 200 });
      if (url.includes("/v2/events/event-1/runs")) return Response.json({ data: [{ id: "run-1", status: "Completed" }] });
      if (url.includes("/v1/runs/run-1/retry")) {
        retryCalls += 1;
        return Response.json({ data: { run_id: "run-2" } });
      }
      return Response.json({ data: { id: "run-2", status: "Queued" } });
    },
  });
  const context = { signal: new AbortController().signal, application: "app", environment: "test", scope: "default", service: "inngest", serviceGeneration: "generation" } as const;
  const receipt = await runtime.submit({ jobId: "job", taskId: "task", taskVersion: "1", buildId: "build", input: null, operationId: "operation", acceptanceIdentity: "accepted-once" }, context);
  const request = { runId: receipt.runId, operationId: "retry-operation", retryIdentity: "retry-once", jobId: "job", taskId: "task", taskVersion: "1", buildId: "build" } as const;
  const first = await runtime.retry!(request, context);
  const second = await runtime.retry!({ ...request, operationId: "different-operation" }, context);
  expect(retryCalls).toBe(1);
  expect(second).toEqual(first);
  await expect(runtime.list({ runId: "run-2" }, context)).resolves.toMatchObject({ items: [{ runId: "run-2", retryOfRunId: "run-1" }] });
  await runtime.close();
});
