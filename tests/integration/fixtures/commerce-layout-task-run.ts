/** Executes actual admitted task envelopes while preserving native build pinning, scope, output validation and run observation. */
import { expect } from "bun:test";
import { Effect, Schema } from "effect";
import {
  submitJob,
  type JobDescriptorAny,
  type JobsRuntime,
} from "../../../packages/jobs/src/index.js";
import type { NativeTaskWork } from "../../../packages/jobs/src/adapter.js";
import { executeTask } from "../../../packages/engine/src/task-executor.js";
import type { TestJobsAdapter } from "../../../packages/testing/src/test-jobs-adapter.types.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";

/**
 * Admits and executes the original moved task through the native adapter protocol.
 * @param job - Original SDK job descriptor proven by the native descriptor guard.
 * @param runtime - Metadata facade borrowing the test-owned adapter.
 * @param adapter - Sole scope-owned native deterministic adapter.
 * @returns Completion after native acceptance, build checks, execution and observation settle.
 */
export const verifyNativeTaskRun = Effect.fn("CommerceTasks.run")(function* (
  job: JobDescriptorAny,
  runtime: JobsRuntime,
  adapter: TestJobsAdapter,
) {
  const handle = yield* scaffoldNative("commerce.tasks.submit", () =>
    submitJob(job, { before: "30 days ago" }, undefined, runtime),
  );
  const context = runtime.operationContext({ signal: new AbortController().signal });
  const worker = adapter.worker;
  if (!worker) throw new Error("Native worker authority is missing");
  const work = yield* scaffoldNative("commerce.tasks.accept", () => worker.next(context));
  if (!work) throw new Error("Native accepted work is missing");
  expect(work.envelope).toMatchObject({
    runId: handle.runId,
    taskId: "orders.cleanup",
    taskVersion: "1",
    jobId: "orders.cleanup",
    scope: "tenant-a",
  });
  const output = yield* executeOriginalTask(job, work);
  yield* scaffoldNative("commerce.tasks.complete", () =>
    worker.complete(handle.runId, output, context),
  );
  expect(adapter.snapshot(handle.runId)).toMatchObject({
    status: "completed",
    output: { removed: 1 },
  });
});

/**
 * Rejects a foreign build before the original native handler executes, then runs the admitted cohort unchanged.
 * @param job - Original compiler-discovered native job/task declaration.
 * @param work - Native adapter-owned envelope and execution binding.
 * @returns Validated task output after its original handler completes.
 */
const executeOriginalTask = Effect.fn("CommerceTasks.execute")(function* (
  job: JobDescriptorAny,
  work: NativeTaskWork,
) {
  const tasks = new Map([[job.task.id, job.task]]);
  yield* scaffoldNative("commerce.tasks.incompatible", async () => {
    await expect(
      executeTask({ ...work.envelope, buildId: "incompatible-old-build" }, work.binding, { tasks }),
    ).rejects.toThrow("Task build is not pinned");
  });
  const output = yield* scaffoldNative("commerce.tasks.execute", () =>
    executeTask(work.envelope, work.binding, { tasks }),
  );
  const checked = Schema.decodeUnknownSync(Schema.Struct({ removed: Schema.Number }))(output);
  expect(checked).toEqual({ removed: 1 });
  return checked;
});
