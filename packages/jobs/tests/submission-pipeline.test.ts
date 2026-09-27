import { z } from "@relkit/schema";
import { Effect, Layer, Result } from "effect";
import { expect, test } from "vitest";
import type { JobsAdapterRuntime } from "../src/adapter.ts";
import { JOBS_ADAPTER_PROTOCOL_VERSION } from "../src/adapter.ts";
import { defineTask } from "../src/define-task.ts";
import { defineJob } from "../src/define-job.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
import { createJobsRuntime } from "../src/runtime.ts";
import { submitCanonicalTask, submitCanonicalTaskEffect } from "../src/submission-canonical.ts";
import { encodeJobWire } from "../src/task-wire.ts";
import { submissionDigestLayer } from "../src/submission-support-hash.ts";
import {
  createSubmissionPipelineEffect,
  JobSubmissionPipelineFailure,
  prepareSubmissionEffect,
  submitJobEffect,
  submitTask,
  submitTaskEffect,
} from "../src/submission.ts";
const task = defineTask({
  id: "orders.submit",
  version: "1",
  input: z.string(),
  output: z.string(),
  handler: async (input) => input,
});
function fixture(submit: JobsAdapterRuntime["submit"]): JobsAdapterRuntime {
  return {
    kind: "jobs-adapter-runtime",
    protocolVersion: JOBS_ADAPTER_PROTOCOL_VERSION,
    capabilities: { service: "test", features: { submission: true } },
    submit,
    get: async () => {
      throw new Error("unused");
    },
    list: async () => {
      throw new Error("unused");
    },
    observe: async function* () {
      yield* [];
    },
    cancel: async () => {
      throw new Error("unused");
    },
    close: async () => {},
  } as JobsAdapterRuntime;
}
test("submission pipeline prepares canonical input before native acceptance", async () => {
  let nativeRequest: Parameters<JobsAdapterRuntime["submit"]>[0] | undefined;
  const adapter = fixture(async (request) => {
    nativeRequest = request;
    return {
      accepted: true,
      runId: "run-1",
      jobId: request.jobId,
      taskId: request.taskId,
      taskVersion: request.taskVersion,
      acceptedAt: "2026-01-01T00:00:00.000Z",
    };
  });
  const runtime = createJobsRuntime({ adapter });
  const receipt = await submitTask(task, "hello", { operationId: "op-1" }, runtime);
  expect(receipt).toMatchObject({ accepted: true, runId: "run-1", taskId: "orders.submit" });
  expect(nativeRequest).toMatchObject({ operationId: "op-1", input: "hello" });
  expect(nativeRequest?.inputHash).toMatch(/^sha256:/);
});
test("invalid input and pre-aborted submission never call the provider", async () => {
  let starts = 0;
  const runtime = createJobsRuntime({
    adapter: fixture(async () => {
      starts++;
      throw new Error("unused");
    }),
  });
  await expect(submitTask(task, 42, { operationId: "op-invalid" }, runtime)).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(
    submitTask(task, "ok", { operationId: "op-abort", signal: controller.signal }, runtime),
  ).rejects.toThrow();
  expect(starts).toBe(0);
});
test("Effect task and job submission use the observer Layer", async () => {
  const seen: string[] = [];
  const layer = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  const adapter = fixture(async (request) => ({
    accepted: true,
    runId: "run-effect",
    jobId: request.jobId,
    taskId: request.taskId,
    taskVersion: request.taskVersion,
    acceptedAt: "2026-01-01T00:00:00.000Z",
  }));
  const runtime = createJobsRuntime({ adapter });
  const receipt = await Effect.runPromise(
    Effect.provide(submitTaskEffect(task, "hello", { operationId: "effect-1" }, runtime), layer),
  );
  expect(receipt.runId).toBe("run-effect");
  const job = defineJob({ name: "ordersSubmit", task });
  await Effect.runPromise(submitJobEffect(job, "hello", { operationId: "effect-2" }, runtime));
  const pipeline = Effect.runSync(createSubmissionPipelineEffect(runtime));
  expect(typeof pipeline.submitTask).toBe("function");
  expect(seen).toContain("submission.submitTask");
  expect(seen).toContain("submission.prepare");
});
test("Effect preparation reports validation failures in a typed channel", async () => {
  const runtime = createJobsRuntime({
    adapter: fixture(async () => {
      throw new Error("unused");
    }),
  });
  const result = await Effect.runPromise(
    Effect.result(prepareSubmissionEffect(runtime, task, 42, { operationId: "invalid-effect" })),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(JobSubmissionPipelineFailure);
});
test("canonical submission pins the input hash before provider acceptance", async () => {
  let starts = 0;
  const runtime = createJobsRuntime({
    adapter: fixture(async (request) => {
      starts++;
      return {
        accepted: true,
        runId: "run-canonical",
        jobId: request.jobId,
        taskId: request.taskId,
        taskVersion: request.taskVersion,
        acceptedAt: "2026-01-01T00:00:00.000Z",
      };
    }),
  });
  const options = { canonicalInput: encodeJobWire("hello"), operationId: "canonical-1" };
  await expect(
    submitCanonicalTask(runtime, task, { ...options, inputHash: "sha256:wrong" }),
  ).rejects.toThrow("hash does not match");
  expect(starts).toBe(0);
  const receipt = await submitCanonicalTask(runtime, task, options);
  expect(receipt.runId).toBe("run-canonical");
  const effectReceipt = await Effect.runPromise(submitCanonicalTaskEffect(runtime, task, options));
  expect(effectReceipt.runId).toBe("run-canonical");
  const failed = await Effect.runPromise(
    Effect.result(
      submitCanonicalTaskEffect(runtime, task, {
        ...options,
        inputHash: "sha256:wrong",
      }),
    ),
  );
  expect(Result.isFailure(failed)).toBe(true);
  if (Result.isFailure(failed)) expect(failed.failure).toBeInstanceOf(JobSubmissionPipelineFailure);
  expect(starts).toBe(2);
});

test("canonical Effect submission uses the injected digest through native acceptance", async () => {
  let inputHash: string | undefined;
  const runtime = createJobsRuntime({
    adapter: fixture(async (request) => {
      inputHash = request.inputHash;
      return {
        accepted: true,
        runId: "run-layer",
        jobId: request.jobId,
        taskId: request.taskId,
        taskVersion: request.taskVersion,
        acceptedAt: "2026-01-01T00:00:00.000Z",
      };
    }),
  });
  const receipt = await Effect.runPromise(
    Effect.provide(
      submitCanonicalTaskEffect(runtime, task, {
        canonicalInput: encodeJobWire("hello"),
        operationId: "digest-layer",
      }),
      submissionDigestLayer(async () => new Uint8Array(32).buffer),
    ),
  );
  expect(receipt.runId).toBe("run-layer");
  expect(inputHash).toBe(`sha256:${"0".repeat(64)}`);
});
