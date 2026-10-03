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
import { assertSafeRun, assertSafeWatchFrame, safeAvailability } from "./projection-validation.js";
import { jobError } from "./support.js";
import type { JobPolicyProjection } from "./types.js";

/** Validate and redact a run according to its public field policy.
 * @param run - Persisted run being inspected.
 * @param policy - Allowed public fields and operations.
 * @param descriptor - Job descriptor supplying canonical schemas and declared errors.
 * @returns The public run snapshot with only selected fields.
 */
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

/** Validate page metadata and apply the job's field projection.
 * @param page - Provider page to validate or project.
 * @param policy - Allowed public fields and operations.
 * @param descriptor - Job descriptor supplying canonical schemas and declared errors.
 * @returns The public page with safe service availability metadata.
 */
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

/** Validate a watch frame and project its embedded run.
 * @param frame - Native frame to validate or encode.
 * @param policy - Allowed public fields and operations.
 * @param descriptor - Job descriptor supplying canonical schemas and declared errors.
 * @returns A frozen frame containing only supported metadata and public run fields.
 */
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

/** Project the optional run in a cancellation receipt.
 * @param receipt - Provider cancellation or retry receipt.
 * @param policy - Allowed public fields and operations.
 * @param descriptor - Job descriptor supplying canonical schemas and declared errors.
 * @returns A frozen receipt with any run restricted to public fields.
 */
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

/** Verify retry identity and expose only supported acceptance fields.
 * @param receipt - Provider cancellation or retry receipt.
 * @param job - Compiled task job registration.
 * @returns A frozen retry receipt matching the selected job/task version.
 */
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

/** Collect declared task error IDs for safe failure projection.
 * @param descriptor - Job descriptor supplying canonical schemas and declared errors.
 * @returns Projection options allowing only the descriptor's declared errors.
 */
function projectionOptions(descriptor: JobDescriptorAny | undefined) {
  const errors = descriptor?.task.errors;
  return errors === undefined ? {} : { declaredErrorIds: errors.map((error) => error.id) };
}

export { projectStreamFrame } from "./projection-stream.js";
