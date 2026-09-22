import { expect, test } from "bun:test";
import { trigger } from "./src/index.ts";
import { localRecipe } from "./src/local.ts";
import { deploymentProfile } from "./src/deployment/index.ts";
import {
  createTriggerHttpClient,
  createTriggerRuntime,
  statusOf,
  type TriggerNativeClient,
  type TriggerSdkApi,
} from "./src/runtime/index.ts";
import { createTriggerTask } from "./src/runtime/task-binding.ts";
import type { NativeControlReceipt } from "@relkit/jobs/adapter";
import { createBindingValueRef } from "@relkit/provider";

test("declares pinned Trigger connections and a separate local recipe", () => {
  const adapter = trigger({
    projectRef: "local",
    secretKey: createBindingValueRef("triggerKey", "secret-string"),
  });
  expect(adapter.adapterId).toBe("trigger");
  expect(adapter.localRecipe).toEqual({
    integrationId: "trigger",
    recipeId: "trigger-docker",
    recipeVersion: 2,
  });
  expect(localRecipe.containers?.map((unit) => unit.id)).toEqual(["postgres", "trigger"]);
  expect(localRecipe.workers?.map((unit) => unit.id)).toEqual(["worker"]);
  expect(deploymentProfile.sdk).toBe("4.5.16");
  expect(() => trigger({ observation: { pollInterval: "1 second" } })).toThrow();
  expect(() => trigger({ limits: { inputBytes: 2_000_000 } })).toThrow();
});

test("uses scoped native reads, controls, and subscription cleanup", async () => {
  let unsubscribed = false;
  const native: TriggerNativeClient = {
    submit: async () => ({
      accepted: true,
      runId: "run-1",
      jobId: "job",
      taskId: "task",
      taskVersion: "1",
      acceptedAt: new Date().toISOString(),
    }),
    get: async () => ({
      accepted: true,
      runId: "run-1",
      jobId: "job",
      taskId: "task",
      taskVersion: "1",
      acceptedAt: new Date().toISOString(),
      buildId: "build",
      service: "trigger",
      scope: "trusted",
      status: "running",
      observedAt: new Date().toISOString(),
      resultAvailability: "pending",
    }),
    list: async () => ({ items: [], hasMore: false, availability: [] }),
    cancel: async (_runId, operationId): Promise<NativeControlReceipt> => ({
      runId: "run-1",
      operationId,
      outcome: "requested",
    }),
    retry: async () => ({
      accepted: true,
      runId: "run-2",
      jobId: "job",
      taskId: "task",
      taskVersion: "1",
      acceptedAt: new Date().toISOString(),
      retryOfRunId: "run-1",
    }),
    subscribeToRun: async () => ({
      stream: (async function* () {
        yield {
          version: 1,
          run: {
            accepted: true,
            runId: "run-1",
            jobId: "job",
            taskId: "task",
            taskVersion: "1",
            acceptedAt: new Date().toISOString(),
            buildId: "build",
            service: "trigger",
            scope: "trusted",
            status: "running",
            observedAt: new Date().toISOString(),
            resultAvailability: "pending",
          },
        };
        yield {
          version: 2,
          run: {
            accepted: true,
            runId: "run-1",
            jobId: "job",
            taskId: "task",
            taskVersion: "1",
            acceptedAt: new Date().toISOString(),
            buildId: "build",
            service: "trigger",
            scope: "trusted",
            status: "completed",
            observedAt: new Date().toISOString(),
            resultAvailability: "void",
          },
        };
      })(),
      unsubscribe: () => {
        unsubscribed = true;
      },
    }),
  };
  const runtime = createTriggerRuntime({
    projectRef: "local",
    baseUrl: "http://trigger.test",
    native,
  });
  const frames = [];
  for await (const frame of runtime.observe({ runId: "run-1" }, { ...context() }))
    frames.push(frame);
  expect(frames.map((frame) => frame.kind)).toEqual(["snapshot", "update", "update"]);
  expect(unsubscribed).toBe(true);
  await runtime.close();
});

test("falls back to bounded native polling when subscription is unavailable", async () => {
  let reads = 0;
  const native: TriggerNativeClient = {
    submit: async () => ({
      accepted: true,
      runId: "run-1",
      jobId: "job",
      taskId: "task",
      taskVersion: "1",
      acceptedAt: new Date().toISOString(),
    }),
    get: async () => {
      reads += 1;
      const status = reads > 1 ? ("completed" as const) : ("running" as const);
      return {
        accepted: true,
        runId: "run-1",
        jobId: "job",
        taskId: "task",
        taskVersion: "1",
        acceptedAt: new Date().toISOString(),
        buildId: "build",
        service: "trigger",
        scope: "trusted",
        status,
        observedAt: new Date().toISOString(),
        resultAvailability: status === "completed" ? ("void" as const) : ("pending" as const),
      };
    },
    list: async () => ({ items: [], hasMore: false, availability: [] }),
    cancel: async (_runId, operationId): Promise<NativeControlReceipt> => ({
      runId: "run-1",
      operationId,
      outcome: "requested",
    }),
    retry: async () => ({
      accepted: true,
      runId: "run-2",
      jobId: "job",
      taskId: "task",
      taskVersion: "1",
      acceptedAt: new Date().toISOString(),
      retryOfRunId: "run-1",
    }),
  };
  const runtime = createTriggerRuntime({
    projectRef: "local",
    baseUrl: "http://trigger.test",
    native,
    pollIntervalMs: 1,
    maxPolls: 2,
  });
  const frames = [];
  for await (const frame of runtime.observe({ runId: "run-1" }, { ...context() }))
    frames.push(frame);
  expect(frames.map((frame) => frame.kind)).toEqual(["snapshot", "update"]);
  expect(reads).toBe(2);
  await runtime.close();
});

test("uses the pinned Trigger SDK operations and maps every native terminal state", async () => {
  const calls: unknown[][] = [];
  const client: TriggerSdkApi = {
    tasks: {
      trigger: async (...args) => {
        calls.push(args);
        return { id: "run-1" };
      },
    },
    runs: {
      retrieve: async (...args) => {
        calls.push(args);
        return {
          id: "run-1",
          status: "TIMED_OUT",
          taskIdentifier: "relkit-job-task-1-build",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        };
      },
      list: async (...args) => {
        calls.push(args);
        return {
          data: [
            {
              id: "run-1",
              status: "COMPLETED",
              taskIdentifier: "task",
              version: "1",
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              metadata: {
                relkitApplication: "app",
                relkitEnvironment: "test",
                relkitService: "trigger",
                relkitJobId: "job",
                relkitTaskId: "task",
                relkitBuildId: "build",
                relkitScope: "trusted",
              },
              tags: ["one"],
              output: null,
            },
          ],
          pagination: { next: "next" },
        };
      },
      cancel: async (...args) => {
        calls.push(args);
        return { id: "run-1" };
      },
      replay: async (...args) => {
        calls.push(args);
        return { id: "run-2" };
      },
      subscribeToRun: () => (async function* () {})(),
    },
  };
  const native = createTriggerHttpClient({
    baseUrl: "http://trigger.test",
    projectRef: "local",
    client,
  });
  const operation = { ...context(), signal: new AbortController().signal };
  const receipt = await native.submit(
    {
      jobId: "job",
      taskId: "task",
      taskVersion: "1",
      buildId: "build",
      input: { value: 1 },
      operationId: "operation",
    },
    operation,
  );
  expect(receipt).toMatchObject({ accepted: true, runId: "run-1" });
  expect(calls[0]?.[0]).toBe("relkit-job-task-1-build");
  expect(await native.get("run-1", operation)).toMatchObject({
    status: "timed-out",
    resultAvailability: "pending",
  });
  expect(
    await native.list(
      { status: ["completed"], taskId: "task", taskVersion: "1", tags: ["one"] },
      operation,
    ),
  ).toMatchObject({ items: [{ status: "completed", output: null }], nextCursor: "next" });
  expect(await native.cancel("run-1", "cancel-op", undefined, operation)).toMatchObject({
    outcome: "requested",
  });
  expect(
    await native.retry(
      { runId: "run-1", operationId: "retry-op", jobId: "job", taskId: "task", taskVersion: "1" },
      operation,
    ),
  ).toMatchObject({ runId: "run-2", retryOfRunId: "run-1" });
  expect(statusOf("EXECUTING")).toBe("running");
  expect(statusOf("SYSTEM_FAILURE")).toBe("failed");
  expect(statusOf("EXPIRED")).toBe("timed-out");
  expect(calls[2]?.[1]).toMatchObject({ status: ["COMPLETED"], version: "1", tag: ["one"] });
});

test("passes Trigger's run abort signal into task execution", async () => {
  let config: Record<string, any> | undefined;
  let receivedSignal: AbortSignal | undefined;
  createTriggerTask(
    {
      createTask: (value) => {
        config = value as Record<string, any>;
        return value;
      },
    },
    {
      id: "task-definition",
      jobId: "job",
      taskId: "task",
      version: "1",
      buildId: "build",
    },
    {
      execute: async (_envelope, binding) => {
        receivedSignal = binding.signal;
        return { ok: true };
      },
    },
  );
  const controller = new AbortController();
  await config?.run(
    {
      relkit: { runId: "run-1", jobId: "job", taskId: "task", taskVersion: "1", buildId: "build" },
      input: { version: 1, kind: "json", value: null },
    },
    { ctx: { run: { id: "run-1" }, attempt: { number: 1 } }, signal: controller.signal },
  );
  expect(receivedSignal).toBe(controller.signal);
});

function context() {
  return {
    signal: new AbortController().signal,
    application: "app",
    environment: "test",
    scope: "trusted",
    service: "trigger",
    serviceGeneration: "generation",
  };
}
