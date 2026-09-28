import { expect, test } from "vitest";
import { Effect, Layer, Result } from "effect";
import { TestClock } from "effect/testing";
import { admissionIdentityLayer, prepareAdmissionEffect } from "../src/submission-admission.ts";
import { JobSubmissionPipelineFailure } from "../src/submission-failure.ts";
import { submitPreparedSubmissionEffect } from "../src/submission-prepared.ts";
import { encodeJobWire } from "../src/task-wire.ts";
import { copyTriggerOptions } from "../src/trigger-validation.ts";
import type { JobsRuntime } from "../src/runtime.ts";
import type { TaskDescriptorAny } from "../src/task-types.ts";
const task = { id: "task" } as TaskDescriptorAny;
const runtime = {
  application: "app",
  environment: "test",
  scope: "trusted",
  jobs: [],
  resolveBinding: () => ({
    jobId: "job",
    taskId: "task",
    taskVersion: "1",
    buildId: "build",
  }),
} as unknown as JobsRuntime;
test("admission Effect uses injected operation identity and clock", async () => {
  const layer = Layer.mergeAll(
    admissionIdentityLayer(() => "fixed-operation"),
    TestClock.layer(),
  );
  const admission = await Effect.runPromise(
    Effect.provide(
      prepareAdmissionEffect(
        runtime,
        task,
        encodeJobWire("hello"),
        copyTriggerOptions({ delay: "1 second" }),
      ),
      layer,
    ),
  );
  expect(admission.metadata.operationId).toBe("fixed-operation");
  expect(admission.metadata.scheduledFor).toBe("1970-01-01T00:00:01.000Z");
  const invalid = await Effect.runPromise(
    Effect.result(
      Effect.provide(
        prepareAdmissionEffect(
          runtime,
          task,
          { version: 2, kind: "void" } as never,
          copyTriggerOptions({}),
        ),
        layer,
      ),
    ),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid))
    expect(invalid.failure).toBeInstanceOf(JobSubmissionPipelineFailure);
});
test("prepared submission Effect preserves receipt identity and pre-abort failure", async () => {
  const writeRuntime = {
    ...runtime,
    capabilities: { service: "test", features: { submission: true } },
    operationContext: ({ signal }: { signal: AbortSignal }) => ({ signal }),
    adapter: {
      submit: async (request: { jobId: string; taskId: string; taskVersion: string }) => ({
        accepted: true,
        runId: "run-1",
        jobId: request.jobId,
        taskId: request.taskId,
        taskVersion: request.taskVersion,
        acceptedAt: "2026-01-01T00:00:00.000Z",
      }),
    },
  } as unknown as JobsRuntime;
  const admission = await Effect.runPromise(
    prepareAdmissionEffect(
      writeRuntime,
      task,
      encodeJobWire("hello"),
      copyTriggerOptions({ operationId: "fixed" }),
    ),
  );
  const receipt = await Effect.runPromise(submitPreparedSubmissionEffect(writeRuntime, admission));
  expect(receipt).toMatchObject({ accepted: true, runId: "run-1" });
  const controller = new AbortController();
  controller.abort();
  const cancelled = await Effect.runPromise(
    Effect.result(submitPreparedSubmissionEffect(writeRuntime, admission, controller.signal)),
  );
  expect(Result.isFailure(cancelled)).toBe(true);
  if (Result.isFailure(cancelled))
    expect(cancelled.failure).toBeInstanceOf(JobSubmissionPipelineFailure);
});
