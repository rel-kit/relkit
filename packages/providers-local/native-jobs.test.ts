import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalNativeJobProvider } from "./src/jobs/native-adapter.ts";
import type { OperationContext, NativeSubmission } from "@relkit/jobs/adapter";

test("persists scoped native runs, honors schedules, and retries retryable tasks", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-native-jobs-"));
  const controller = new AbortController();
  const context: OperationContext = {
    signal: controller.signal,
    application: "app",
    environment: "test",
    scope: "scope-a",
    service: "local:default",
    serviceGeneration: "generation.test",
  };
  const request: NativeSubmission = {
    jobId: "jobs.send",
    taskId: "tasks.send",
    taskVersion: "1",
    buildId: "build-1",
    execution: "retryable",
    scope: "scope-a",
    input: { id: "send-1" },
    operationId: "operation-1",
    idempotencyKey: "send-1",
    scheduledFor: new Date(Date.now() + 60_000).toISOString(),
    policy: {
      retry: { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" },
    },
  };
  try {
    const first = createLocalNativeJobProvider(root, "default");
    const accepted = await first.submit(request, context);
    expect(await first.worker!.next(context)).toBeUndefined();
    await first.close();

    const reopened = createLocalNativeJobProvider(root, "default");
    expect(await reopened.submit(request, context)).toMatchObject({
      runId: accepted.runId,
      duplicate: true,
    });
    await expect(reopened.get(accepted.runId, { ...context, scope: "scope-b" })).rejects.toThrow(
      "not found",
    );
    const { scheduledFor: _scheduledFor, ...unscheduledRequest } = request;
    const retriedRequest: NativeSubmission = {
      ...unscheduledRequest,
      idempotencyKey: "send-2",
      operationId: "operation-2",
    };
    const retried = await reopened.submit(retriedRequest, context);
    const work = await reopened.worker!.next(context);
    expect(work?.envelope.runId).toBe(retried.runId);
    await reopened.worker!.fail(retried.runId, new Error("temporary"), context);
    const retryWork = await reopened.worker!.next(context);
    expect(retryWork?.envelope.attempt).toBe(2);
    await reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parks durable sleeps and persists the continuation checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-native-jobs-"));
  try {
    const adapter = createLocalNativeJobProvider(root, "default");
    const context: OperationContext = {
      signal: new AbortController().signal,
      application: "app",
      environment: "test",
      scope: "scope-a",
      service: "local:default",
      serviceGeneration: "generation.test",
    };
    const accepted = await adapter.submit(
      {
        jobId: "jobs.durable",
        taskId: "tasks.durable",
        taskVersion: "1",
        buildId: "build-1",
        execution: "durable",
        input: {},
        operationId: "operation-durable",
      },
      context,
    );
    const work = await adapter.worker!.next(context);
    await expect(work?.binding.sleep?.sleep("pause", 20)).rejects.toMatchObject({
      code: "RELKIT_LOCAL_TASK_SLEEP",
    });
    await adapter.worker!.suspend!(
      accepted.runId,
      {
        code: "RELKIT_LOCAL_TASK_SLEEP",
        key: "pause",
        wakeAt: new Date(Date.now() + 20).toISOString(),
      },
      context,
    );
    await adapter.close();

    const reopened = createLocalNativeJobProvider(root, "default");
    expect((await reopened.get(accepted.runId, context)).status).toBe("sleeping");
    await new Promise((resolve) => setTimeout(resolve, 25));
    const resumed = await reopened.worker!.next(context);
    await expect(resumed?.binding.sleep?.sleep("pause", 20)).resolves.toBeUndefined();
    await reopened.worker!.complete(accepted.runId, true, context);
    await reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
