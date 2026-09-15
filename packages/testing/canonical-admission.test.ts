import { expect, test } from "bun:test";
import { defineJob, defineTask, createJobsRuntime, submitCanonicalTask, submitTask } from "@relkit/jobs";
import { z } from "@relkit/schema";
import { createDeterministicJobsAdapter } from "./src/test-jobs-adapter.ts";

test("replays canonical task input without applying the public transform twice", async () => {
  let transforms = 0;
  const task = defineTask({
    id: "tasks.canonical",
    version: "1",
    input: z.string().transform((value) => { transforms += 1; return Number(value); }),
    inputWire: z.number(),
    output: z.number(),
    handler: async (value) => value,
  });
  const adapter = createDeterministicJobsAdapter({ startTimeMs: 0 });
  const runtime = createJobsRuntime({
    adapter,
    application: "app",
    environment: "test",
    scope: "tenant-a",
    service: "default",
    serviceGeneration: "generation-a",
    manifest: {
      protocol: "relkit.jobs-manifest",
      version: 1,
      jobsProtocolVersion: 1,
      tasks: [{ id: task.id, version: task.version, buildId: "build-a" }],
      jobs: [{ id: "jobs.canonical", name: "canonical", taskId: task.id, taskVersion: task.version, buildId: "build-a", profile: "default", default: true }],
    },
  });

  const first = await submitTask(task, "7", undefined, runtime);
  const replay = await submitCanonicalTask(runtime, task, {
    canonicalInput: { version: 1, kind: "json", value: 7 },
    operationId: "retry-1",
  });
  expect(first.runId).not.toBe(replay.runId);
  expect(transforms).toBe(1);
  expect((await adapter.worker!.next(runtime.operationContext({ signal: new AbortController().signal })))?.envelope.input).toEqual({ version: 1, kind: "json", value: 7 });
  await runtime.close();
});

test("uses the default configured job admission policy for task triggers", async () => {
  const task = defineTask({
    id: "tasks.admitted",
    version: "1",
    input: z.object({ id: z.string() }),
    output: z.boolean(),
    handler: async () => true,
  });
  const job = defineJob({
    name: "admitted",
    task,
    default: true,
    admission: { idempotency: { key: "id" } },
  });
  const adapter = createDeterministicJobsAdapter();
  const runtime = createJobsRuntime({ adapter, jobs: [job], application: "app", environment: "test" });

  const first = await submitTask(task, { id: "same" }, undefined, runtime);
  const duplicate = await submitTask(task, { id: "same" }, undefined, runtime);
  expect(duplicate.runId).toBe(first.runId);
  expect(duplicate.duplicate).toBe(true);
  await runtime.close();
});
