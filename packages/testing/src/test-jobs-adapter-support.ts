import type { TestNativeRun } from "./test-jobs-adapter-support.types.js";
export type { TestNativeRun } from "./test-jobs-adapter-support.types.js";
import { canonicalJson } from "@relkit/contracts";
import type { JobErrorEnvelope, RunSnapshot } from "@relkit/contracts/jobs";
import type { NativeSubmission } from "@relkit/jobs/adapter";
import type { TestClock } from "./runtime.js";
import type { NativeJobsState } from "./native-jobs.types.js";

/**
 * Reads a detached native snapshot, including retained state after owner close.
 * @param state Authoritative native runs owned by this adapter.
 * @param runId Accepted native run identity.
 * @param service Native service identity retained in the projection.
 * @param clock Injected domain observation clock.
 * @returns A detached snapshot, preserving the established missing-run error.
 */
export function detachedNativeSnapshot(
  state: NativeJobsState,
  runId: string,
  service: string,
  clock: TestClock,
) {
  const run = state.runs.get(runId);
  if (run === undefined) throw new Error("Test run was not found");
  return structuredClone(snapshotOf(run, service, clock));
}

/**
 * Classifies native job terminal lifecycle states.
 * @param status - Native run lifecycle status.
 * @returns True for completed, failed or cancelled native runs.
 */
export function isTerminal(status: RunSnapshot["status"]): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "timed-out"
  );
}

/**
 * Projects a native run using the injected observation clock.
 * @param run - Authoritative native run state.
 * @param service - Native service identity included in public run snapshots.
 * @param clock - Injected deterministic domain clock.
 * @returns The existing native snapshot shape without sharing mutable provider state.
 */
export function snapshotOf(run: TestNativeRun, service: string, clock: TestClock): RunSnapshot {
  const base = {
    accepted: true as const,
    runId: run.runId,
    jobId: run.request.jobId,
    taskId: run.request.taskId,
    taskVersion: run.request.taskVersion,
    acceptedAt: run.acceptedAt,
    buildId: run.request.buildId,
    service,
    ...(run.request.inputHash === undefined ? {} : { inputHash: run.request.inputHash }),
    ...(run.request.inputSchemaHash === undefined
      ? {}
      : { inputSchemaHash: run.request.inputSchemaHash }),
    ...(run.request.acceptanceIdentity === undefined
      ? {}
      : { acceptanceIdentity: run.request.acceptanceIdentity }),
    ...(run.request.scope === undefined ? {} : { scope: run.request.scope }),
    status: run.status,
    observedAt: clock.now().toISOString(),
    resultAvailability: "pending" as const,
    attempt: run.attempt,
    ...(run.startedAt === undefined ? {} : { startedAt: run.startedAt }),
    ...(run.completedAt === undefined ? {} : { completedAt: run.completedAt }),
    ...(run.request.scheduledFor === undefined ? {} : { scheduledFor: run.request.scheduledFor }),
    ...(run.request.parentRunId === undefined ? {} : { parentRunId: run.request.parentRunId }),
    ...(run.retryOfRunId === undefined ? {} : { retryOfRunId: run.retryOfRunId }),
    ...(run.error === undefined ? {} : { error: run.error }),
  };
  if (run.status === "completed") {
    return {
      ...base,
      resultAvailability: run.output === undefined ? "void" : "available",
      ...(run.output === undefined ? {} : { output: run.output }),
    } as RunSnapshot;
  }
  return base as RunSnapshot;
}

/**
 * Projects an unknown worker failure into the existing public envelope.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns A bounded code/message error envelope.
 */
export function failureOf(value: unknown): JobErrorEnvelope {
  const candidate =
    value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
  return {
    code:
      typeof candidate?.code === "string"
        ? candidate.code
        : value instanceof Error
          ? value.name
          : "RELKIT_TASK_FAILED",
    message:
      typeof candidate?.message === "string"
        ? candidate.message
        : value instanceof Error
          ? value.message
          : String(value),
  };
}

/**
 * Builds the existing canonical submission deduplication identity.
 * @param request - Native operation input carrying explicit identity and execution context.
 * @returns The canonical key, or undefined when deduplication is not requested.
 */
export function requestKey(request: NativeSubmission): string | undefined {
  if (request.idempotencyKey === undefined && request.occurrenceIdentity === undefined)
    return undefined;
  return canonicalJson([
    request.jobId,
    request.idempotencyKey ?? null,
    request.occurrenceIdentity ?? null,
  ]);
}
