import { canonicalJson } from "@relkit/contracts";
import type { JobErrorEnvelope, JobWireEnvelope, RunSnapshot } from "@relkit/contracts/jobs";
import type { NativeSubmission } from "@relkit/jobs/adapter";

export interface TestNativeRun {
  readonly request: NativeSubmission;
  readonly runId: string;
  readonly acceptedAt: string;
  status: RunSnapshot["status"];
  attempt: number;
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: JobErrorEnvelope;
  retryOfRunId?: string;
  readonly canonicalInput: JobWireEnvelope;
  controller?: AbortController;
}

export function isTerminal(status: RunSnapshot["status"]): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "timed-out"
  );
}

export function snapshotOf(run: TestNativeRun, service: string): RunSnapshot {
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
    observedAt: new Date().toISOString(),
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

export function requestKey(request: NativeSubmission): string | undefined {
  if (request.idempotencyKey === undefined && request.occurrenceIdentity === undefined)
    return undefined;
  return canonicalJson([
    request.jobId,
    request.idempotencyKey ?? null,
    request.occurrenceIdentity ?? null,
  ]);
}
