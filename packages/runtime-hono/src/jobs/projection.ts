import type {
  RunCancellationReceipt,
  RunPage,
  RunRetryReceipt,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";
import type { TaskJobNode } from "@relkit/graph";
import type { JobDescriptorAny } from "@relkit/jobs";
import { projectRunPage, projectRunSnapshot } from "@relkit/jobs";
import type { JobPolicyProjection } from "./types.js";
import { jobError } from "./support.js";
import { assertSafeRun, assertSafeWatchFrame, safeAvailability } from "./projection-validation.js";

export function projectSnapshot(
  run: RunSnapshot,
  policy: JobPolicyProjection,
  descriptor?: JobDescriptorAny,
): RunSnapshot {
  try {
    assertSafeRun(run);
    return projectRunSnapshot(run, policy.fields, projectionOptions(descriptor));
  } catch {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job run was not found.");
  }
}

export function projectPage(
  page: RunPage<RunSnapshot>,
  policy: JobPolicyProjection,
  descriptor?: JobDescriptorAny,
): RunPage<RunSnapshot> {
  if (
    !Array.isArray(page.items) ||
    !Array.isArray(page.availability) ||
    typeof page.hasMore !== "boolean"
  ) {
    throw jobError("RELKIT_JOB_RUN_NOT_FOUND", "Job run page is unavailable.");
  }
  return projectRunPage(
    { ...page, availability: safeAvailability(page.availability) },
    policy.fields,
    projectionOptions(descriptor),
  );
}

export function projectWatchFrame(
  frame: RunWatchFrame<RunSnapshot>,
  policy: JobPolicyProjection,
  descriptor?: JobDescriptorAny,
): RunWatchFrame<RunSnapshot> {
  assertSafeWatchFrame(frame);
  const run = projectSnapshot(frame.run as RunSnapshot, policy, descriptor);
  if (frame.kind === "snapshot") {
    return Object.freeze({
      kind: "snapshot",
      run,
      observedAt: frame.observedAt,
      epoch: frame.epoch,
      sequence: frame.sequence,
      ...(frame.cursor === undefined ? {} : { cursor: frame.cursor }),
      continuity: frame.continuity,
    });
  }
  if (frame.kind === "update") {
    return Object.freeze({
      kind: "update",
      run,
      observedAt: frame.observedAt,
      epoch: frame.epoch,
      sequence: frame.sequence,
      ...(frame.cursor === undefined ? {} : { cursor: frame.cursor }),
    });
  }
  return Object.freeze({
    kind: "reset",
    run,
    observedAt: frame.observedAt,
    epoch: frame.epoch,
    sequence: frame.sequence,
    reason: frame.reason,
    ...(frame.cursor === undefined ? {} : { cursor: frame.cursor }),
  });
}

export function projectCancellation(
  receipt: RunCancellationReceipt,
  policy: JobPolicyProjection,
  descriptor?: JobDescriptorAny,
): RunCancellationReceipt {
  return Object.freeze({
    runId: receipt.runId,
    operationId: receipt.operationId,
    outcome: receipt.outcome,
    ...(receipt.requestedAt === undefined ? {} : { requestedAt: receipt.requestedAt }),
    ...(receipt.run === undefined ? {} : { run: projectSnapshot(receipt.run, policy, descriptor) }),
  });
}

export function projectRetry(
  receipt: RunRetryReceipt,
  job: Pick<TaskJobNode, "jobId" | "taskId" | "taskVersion">,
): RunRetryReceipt {
  if (
    receipt.jobId !== job.jobId ||
    receipt.taskId !== job.taskId ||
    receipt.taskVersion !== job.taskVersion
  ) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job retry receipt is unavailable.");
  }
  return Object.freeze({
    accepted: true,
    runId: receipt.runId,
    jobId: receipt.jobId,
    taskId: receipt.taskId,
    taskVersion: receipt.taskVersion,
    acceptedAt: receipt.acceptedAt,
    retryOfRunId: receipt.retryOfRunId,
    ...(receipt.duplicate === true ? { duplicate: true } : {}),
    ...(receipt.idempotencyExpiresAt === undefined
      ? {}
      : { idempotencyExpiresAt: receipt.idempotencyExpiresAt }),
  });
}

function projectionOptions(descriptor: JobDescriptorAny | undefined) {
  const errors = descriptor?.task.errors;
  return errors === undefined ? {} : { declaredErrorIds: errors.map((error) => error.id) };
}

export { projectStreamFrame } from "./projection-stream.js";
