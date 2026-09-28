import { z } from "@relkit/schema";
import { Effect, Layer, Result } from "effect";
import { TestClock } from "effect/testing";
import { expect, test } from "vitest";
import { JobsTelemetry } from "../src/jobs-observability.ts";
import type { JobsRuntime } from "../src/runtime.ts";
import { admissionIdentityLayer } from "../src/submission-admission.ts";
import { JobSubmissionPipelineFailure } from "../src/submission-failure.ts";
import { submissionDigestLayer } from "../src/submission-support-hash.ts";
import {
  prepareCanonicalSubmission,
  prepareCanonicalSubmissionEffect,
  prepareSubmission,
  prepareSubmissionEffect,
} from "../src/submission-prepare.ts";
import type { TaskDescriptorAny } from "../src/task-types.ts";
import { encodeJobWire } from "../src/task-wire.ts";
const task = { id: "task", input: z.string() } as TaskDescriptorAny;
let bindingCalls = 0;
const runtime = {
  application: "app",
  environment: "test",
  scope: "trusted",
  jobs: [],
  resolveBinding: () => {
    bindingCalls++;
    return { jobId: "job", taskId: "task", taskVersion: "1", buildId: "build" };
  },
} as unknown as JobsRuntime;
test("preparation composes validation, admission identity, clock, and telemetry Layers", async () => {
  const seen: string[] = [];
  const layers = Layer.mergeAll(
    admissionIdentityLayer(() => "fixed-operation"),
    submissionDigestLayer(async () => new Uint8Array(32).buffer),
    TestClock.layer(),
    Layer.succeed(
      JobsTelemetry,
      JobsTelemetry.of({
        observe: (operation, effect) => {
          seen.push(operation);
          return effect;
        },
      }),
    ),
  );
  const admission = await Effect.runPromise(
    Effect.provide(prepareSubmissionEffect(runtime, task, "hello", { delay: "1 second" }), layers),
  );
  expect(admission.metadata.operationId).toBe("fixed-operation");
  expect(admission.metadata.scheduledFor).toBe("1970-01-01T00:00:01.000Z");
  expect(admission.inputHash).toBe(`sha256:${"0".repeat(64)}`);
  expect(seen).toEqual(
    expect.arrayContaining([
      "submission.prepare",
      "trigger.copyOptions",
      "taskWire.validateInput",
      "submission.admission",
    ]),
  );
  expect(
    (await prepareSubmission(runtime, task, "hello", { operationId: "sync" })).metadata.operationId,
  ).toBe("sync");
});
test("canonical preparation succeeds and invalid trigger options stop before binding", async () => {
  const canonicalInput = encodeJobWire("hello");
  const prepared = await Effect.runPromise(
    prepareCanonicalSubmissionEffect(runtime, task, canonicalInput, { operationId: "canonical" }),
  );
  expect(prepared.metadata.operationId).toBe("canonical");
  expect(
    (await prepareCanonicalSubmission(runtime, task, canonicalInput, { operationId: "compat" }))
      .metadata.operationId,
  ).toBe("compat");
  const before = bindingCalls;
  const failed = await Effect.runPromise(
    Effect.result(prepareSubmissionEffect(runtime, task, "hello", { unsupported: true })),
  );
  expect(Result.isFailure(failed)).toBe(true);
  if (Result.isFailure(failed)) expect(failed.failure).toBeInstanceOf(JobSubmissionPipelineFailure);
  expect(bindingCalls).toBe(before);
  await expect(prepareSubmission(runtime, task, "hello", { unsupported: true })).rejects.toThrow(
    TypeError,
  );
});
