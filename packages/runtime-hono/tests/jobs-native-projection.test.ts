import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalJobProvider } from "@relkit/providers-local";
import {
  createJobsRuntime,
  defineJob,
  defineTask,
  stableIdentityTuple,
  submitJob,
} from "@relkit/jobs";
import type { RunSnapshot } from "@relkit/contracts/jobs";
import { z } from "@relkit/schema";
import { validateCanonicalRun } from "../src/jobs/handlers-validation.js";
import { projectSnapshot, projectWatchFrame } from "../src/jobs/projection.js";
import { assertSafeRun } from "../src/jobs/projection-validation.js";

const policy = { operations: [], fields: [], streams: [] };
const base = {
  accepted: true,
  runId: "run-1",
  jobId: "job-1",
  taskId: "task-1",
  taskVersion: "1",
  acceptedAt: "2026-01-01T00:00:00.000Z",
  buildId: "1",
  service: "local",
  status: "queued",
  observedAt: "2026-01-01T00:00:00.000Z",
  resultAvailability: "pending",
} satisfies RunSnapshot;

it.effect("projects actual native admission identities through get and watch validation", () =>
  Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-native-job-projection-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    );
    const adapter = yield* Effect.acquireRelease(
      Effect.sync(() => createLocalJobProvider(root, "local", "task")),
      (provider) => Effect.promise(() => provider.close()),
    );
    const task = defineTask({
      id: "acceptance.held-task",
      version: "1",
      input: z.string(),
      output: z.string(),
      handler: async (input) => input,
    });
    const job = defineJob({
      id: "acceptance.held-job",
      name: "heldJob",
      task,
      service: "local",
    });
    const runtime = createJobsRuntime({
      adapter,
      application: "held-jobs",
      environment: "test",
      scope: "public:held-jobs",
      service: "local",
      jobs: [job],
      tasks: [task],
    });
    yield* Effect.addFinalizer(() => Effect.promise(() => runtime.close()));
    const receipt = yield* Effect.promise(() => submitJob(job, "native input", {}, runtime));
    const context = runtime.operationContext({ signal: new AbortController().signal });
    const run = yield* Effect.promise(() => adapter.get(receipt.runId, context));
    expect(new TextEncoder().encode(run.acceptanceIdentity).byteLength).toBeGreaterThan(256);
    yield* Effect.promise(() => validateCanonicalRun(job, run));
    expect(projectSnapshot(run, policy, job)).toMatchObject({
      runId: receipt.runId,
      status: "queued",
    });
    const iterator = yield* Effect.acquireRelease(
      Effect.sync(() => adapter.observe({ runId: receipt.runId }, context)[Symbol.asyncIterator]()),
      (source) =>
        Effect.promise(async () => {
          await source.return?.();
        }),
    );
    const frame = yield* Effect.promise(() => iterator.next());
    expect(frame.done).toBe(false);
    if (frame.done) throw new Error("Actual native observation did not emit its initial snapshot.");
    yield* Effect.promise(() => validateCanonicalRun(job, frame.value.run));
    expect(projectWatchFrame(frame.value, policy, job).run).toMatchObject({
      runId: receipt.runId,
      status: "queued",
    });
  }).pipe(Effect.scoped),
);

it("allows worst-case escaped canonical components within a finite composite bound", () => {
  const identity = stableIdentityTuple(Array.from({ length: 8 }, () => "\u0000".repeat(256)));
  expect(new TextEncoder().encode(identity).byteLength).toBe(12_521);
  expect(() => assertSafeRun({ ...base, acceptanceIdentity: identity })).not.toThrow();
  // Native public retry forwards the original acceptance identity without appending to it.
  expect(() =>
    assertSafeRun({ ...base, retryOfRunId: "original", acceptanceIdentity: identity }),
  ).not.toThrow();
});

it("rejects oversized UTF-8 identities and malformed identity values", () => {
  for (const acceptanceIdentity of ["", 42, {}, "a".repeat(12_522), "é".repeat(6_261)]) {
    expect(() => assertSafeRun({ ...base, acceptanceIdentity })).toThrow();
  }
});

it("retains scalar metadata bounds and malformed run rejection", () => {
  expect(() => assertSafeRun({ ...base, runId: "a".repeat(257) })).toThrow();
  expect(() => assertSafeRun({ ...base, parentRunId: "é".repeat(129) })).toThrow();
  expect(() => assertSafeRun({ ...base, status: "invalid" })).toThrow();
  expect(() => assertSafeRun({ ...base, output: "unsettled" })).toThrow();
});
