import { expect, test } from "bun:test";
import { stableIdentityTuple } from "@relkit/jobs";
import type { NativeSubmission } from "@relkit/jobs/adapter";
import { createDeterministicJobsAdapter } from "./src/test-jobs-adapter.ts";

const context = {
  signal: new AbortController().signal,
  application: "test-app",
  environment: "test",
  scope: "tenant-a",
  service: "test-jobs",
  serviceGeneration: "generation-a",
} as const;

test("keeps type-preserving identity tuples distinct", () => {
  expect(stableIdentityTuple([1])).not.toBe(stableIdentityTuple(["1"]));
  expect(stableIdentityTuple(["1"])).toBe(stableIdentityTuple(["1"]));
});

test("uses first-wins submission deduplication and native retry deduplication", async () => {
  const adapter = createDeterministicJobsAdapter({ startTimeMs: 1_000 });
  const first = await adapter.submit(request("1", "submit-1"), context);
  const duplicate = await adapter.submit({ ...request("2", "submit-2"), idempotencyKey: "business-key" }, context);
  const same = await adapter.submit({ ...request("3", "submit-3"), idempotencyKey: "business-key" }, context);
  expect((first as { readonly accepted: boolean }).accepted).toBe(true);
  expect((same as { readonly runId: string }).runId).toBe((duplicate as { readonly runId: string }).runId);
  expect((same as { readonly duplicate?: boolean }).duplicate).toBe(true);

  const run = first as { readonly runId: string };
  await adapter.worker!.fail(run.runId, new Error("failed"), context);
  const retried = await adapter.retry!({ runId: run.runId, operationId: "retry-1", retryIdentity: "retry-identity" }, context);
  const repeated = await adapter.retry!({ runId: run.runId, operationId: "retry-1", retryIdentity: "retry-identity" }, context);
  expect((retried as { readonly retryOfRunId: string }).retryOfRunId).toBe(run.runId);
  expect((repeated as { readonly runId: string }).runId).toBe((retried as { readonly runId: string }).runId);
});

test("makes cancel race and unknown write outcomes explicit", async () => {
  const adapter = createDeterministicJobsAdapter({ startTimeMs: 1_000 });
  const accepted = await adapter.submit(request("cancel", "submit"), context) as { readonly runId: string };
  const first = await adapter.cancel({ runId: accepted.runId, operationId: "cancel-1" }, context);
  const second = await adapter.cancel({ runId: accepted.runId, operationId: "cancel-2" }, context);
  expect(first).toMatchObject({ outcome: "requested" });
  expect(second).toMatchObject({ outcome: "already-terminal" });

  const unknown = createDeterministicJobsAdapter({ unknown: { submit: true } });
  await expect(unknown.submit(request("unknown", "unknown"), context)).resolves.toMatchObject({
    outcome: "unknown",
    operationId: "unknown",
  });
});

function request(value: string, operationId: string): NativeSubmission {
  return {
    jobId: "jobs.test",
    taskId: "tasks.test",
    taskVersion: "1",
    buildId: "build.test",
    scope: "tenant-a",
    input: { value },
    canonicalInput: { version: 1, kind: "json", value: { value } },
    operationId,
    acceptanceIdentity: stableIdentityTuple(["jobs.test", value]),
    idempotencyKey: value === "1" ? "first" : undefined,
  } as NativeSubmission;
}
