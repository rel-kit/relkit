import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeTask } from "../../src/engine/task-executor.ts";
import {
  createJobsRuntime,
  defineJob,
  defineTask,
  submitJob,
  type JobDescriptorAny,
  type JobsRuntime,
} from "../../src/jobs/index.ts";
import type { NativeJobsAdapter } from "../../src/jobs/adapter.js";
import { createLocalNativeJobProvider } from "../../src/providers-local/jobs/native-adapter.ts";
import { z } from "../../src/schema/index.js";

let root: string;
let adapter: NativeJobsAdapter;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "relkit-native-limits-"));
  adapter = createLocalNativeJobProvider(root, "default");
});

afterEach(async () => {
  await adapter.close?.();
  await rm(root, { recursive: true, force: true });
});

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Builds a job over one task with the limits under test. */
function job(
  limits: { maxDuration?: string; maxElapsed?: string; maxAttempts?: number },
  handler: (context: {
    sleep: (duration: string, options: { key: string }) => Promise<void>;
  }) => Promise<unknown>,
) {
  const task = defineTask({
    id: "limits.work",
    version: "1",
    input: z.object({}),
    output: z.object({ done: z.boolean() }),
    retry: {
      maxAttempts: limits.maxAttempts ?? 1,
      initialDelay: "1 millisecond",
      maxDelay: "1 millisecond",
    },
    ...(limits.maxDuration === undefined ? {} : { maxDuration: limits.maxDuration as never }),
    ...(limits.maxElapsed === undefined ? {} : { maxElapsed: limits.maxElapsed as never }),
    handler: async (_input, context) => {
      await handler(context as never);
      return { done: true };
    },
  });
  return defineJob({ name: "limitsWork", task });
}

function runtimeOf(descriptor: JobDescriptorAny): JobsRuntime {
  return createJobsRuntime({
    adapter,
    jobs: [descriptor],
    application: "app",
    environment: "test",
    service: "default",
    scope: "scope-a",
  });
}

/** Runs one worker pass the way the generated server does; resolves whether work ran. */
async function pass(descriptor: JobDescriptorAny, runtime: JobsRuntime): Promise<boolean> {
  const context = runtime.operationContext({ signal: new AbortController().signal });
  const worker = adapter.worker!;
  const work = await worker.next(context);
  if (work === undefined) return false;
  try {
    const output = await executeTask(work.envelope, work.binding, {
      tasks: new Map([[descriptor.task.id, descriptor.task]]),
    });
    await worker.complete(work.envelope.runId, output, context);
  } catch (error) {
    if (work.binding.isSuspension?.(error) === true)
      await worker.suspend!(work.envelope.runId, error, context);
    else await worker.fail(work.envelope.runId, error, context);
  }
  return true;
}

async function statusOf(runtime: JobsRuntime, runId: string) {
  const context = runtime.operationContext({ signal: new AbortController().signal });
  return adapter.get(runId, context);
}

test("an attempt that works longer than maxDuration is stopped and the run times out", async () => {
  let finished = false;
  const descriptor = job({ maxDuration: "200 milliseconds" }, async () => {
    await wait(1_000);
    finished = true;
  });
  const runtime = runtimeOf(descriptor);
  const handle = await submitJob(descriptor, {}, undefined, runtime);
  const started = Date.now();
  expect(await pass(descriptor, runtime)).toBe(true);
  expect(Date.now() - started).toBeLessThan(800);
  expect(finished).toBe(false);
  expect(await statusOf(runtime, handle.runId)).toMatchObject({
    status: "timed-out",
    error: { code: "RELKIT_TIMEOUT" },
  });
});

test("an attempt stopped by maxDuration is retried while attempts remain", async () => {
  let attempts = 0;
  const descriptor = job({ maxDuration: "200 milliseconds", maxAttempts: 2 }, async () => {
    attempts += 1;
    if (attempts === 1) await wait(1_000);
  });
  const runtime = runtimeOf(descriptor);
  const handle = await submitJob(descriptor, {}, undefined, runtime);
  await pass(descriptor, runtime);
  expect(await statusOf(runtime, handle.runId)).toMatchObject({ status: "queued", attempt: 2 });
  await wait(5);
  await pass(descriptor, runtime);
  expect(await statusOf(runtime, handle.runId)).toMatchObject({ status: "completed" });
});

test("time asleep does not count toward maxDuration, time worked before it does", async () => {
  const descriptor = job({ maxDuration: "500 milliseconds" }, async (context) => {
    await wait(20);
    await context.sleep("600 milliseconds", { key: "pause" });
    await wait(20);
  });
  const runtime = runtimeOf(descriptor);
  const handle = await submitJob(descriptor, {}, undefined, runtime);
  await pass(descriptor, runtime);
  expect((await statusOf(runtime, handle.runId)).status).toBe("sleeping");
  await wait(620);
  await pass(descriptor, runtime);
  expect((await statusOf(runtime, handle.runId)).status).toBe("completed");

  const slow = job({ maxDuration: "500 milliseconds" }, async (context) => {
    await wait(300);
    await context.sleep("20 milliseconds", { key: "pause" });
    await wait(300);
  });
  const slowRuntime = runtimeOf(slow);
  const slowHandle = await submitJob(slow, {}, { idempotencyKey: "slow" }, slowRuntime);
  await pass(slow, slowRuntime);
  await wait(30);
  await pass(slow, slowRuntime);
  expect(await statusOf(slowRuntime, slowHandle.runId)).toMatchObject({
    status: "timed-out",
    error: { code: "RELKIT_TIMEOUT" },
  });
});

test("a run past maxElapsed times out without another attempt", async () => {
  let attempts = 0;
  const descriptor = job({ maxElapsed: "200 milliseconds", maxAttempts: 8 }, async () => {
    attempts += 1;
    await wait(90);
    throw new Error("still failing");
  });
  const runtime = runtimeOf(descriptor);
  const handle = await submitJob(descriptor, {}, undefined, runtime);
  for (let index = 0; index < 8; index += 1) {
    await pass(descriptor, runtime);
    await wait(5);
  }
  expect(attempts).toBeLessThan(4);
  expect(await statusOf(runtime, handle.runId)).toMatchObject({
    status: "timed-out",
    error: { code: "RELKIT_TIMEOUT" },
  });
});

test("a run asleep past maxElapsed times out at the limit, not when it would wake", async () => {
  const descriptor = job({ maxElapsed: "400 milliseconds" }, async (context) => {
    await context.sleep("10 seconds", { key: "long" });
  });
  const runtime = runtimeOf(descriptor);
  const handle = await submitJob(descriptor, {}, undefined, runtime);
  await pass(descriptor, runtime);
  expect((await statusOf(runtime, handle.runId)).status).toBe("sleeping");
  await wait(420);
  expect(await pass(descriptor, runtime)).toBe(true);
  expect(await statusOf(runtime, handle.runId)).toMatchObject({
    status: "timed-out",
    error: { code: "RELKIT_TIMEOUT" },
  });
});

test("a run without limits is not given a deadline", async () => {
  const descriptor = job({}, async () => wait(5));
  const runtime = runtimeOf(descriptor);
  const handle = await submitJob(descriptor, {}, undefined, runtime);
  const context = runtime.operationContext({ signal: new AbortController().signal });
  const work = await adapter.worker!.next(context);
  expect(work?.binding.run.deadlineMs).toBeUndefined();
  await adapter.worker!.complete(handle.runId, { done: true }, context);
});
