import { canonicalJson } from "@relkit/contracts";
import type { JobErrorEnvelope, RunSnapshot } from "@relkit/contracts/jobs";
import type { NativeSubmission, OperationContext } from "@relkit/jobs/adapter";
import type { LocalNativeNamespace, LocalNativeRun } from "./native-adapter-types.js";

export const LOCAL_SLEEP_SUSPENSION_CODE = "RELKIT_LOCAL_TASK_SLEEP" as const;

export interface LocalSleepSuspension {
  readonly code: typeof LOCAL_SLEEP_SUSPENSION_CODE;
  readonly key: string;
  readonly wakeAt: string;
}

export function snapshotOf(run: LocalNativeRun): RunSnapshot {
  const base = {
    accepted: true as const,
    runId: run.runId,
    jobId: run.request.jobId,
    taskId: run.request.taskId,
    taskVersion: run.request.taskVersion,
    acceptedAt: run.acceptedAt,
    buildId: run.request.buildId,
    service: run.service,
    ...(run.request.inputHash === undefined ? {} : { inputHash: run.request.inputHash }),
    ...(run.request.inputSchemaHash === undefined ? {} : { inputSchemaHash: run.request.inputSchemaHash }),
    ...(run.request.acceptanceIdentity === undefined ? {} : { acceptanceIdentity: run.request.acceptanceIdentity }),
    ...(run.request.scope === undefined ? {} : { scope: run.request.scope }),
    status: run.status,
    observedAt: new Date().toISOString(),
    resultAvailability: run.status === "completed" && run.output !== undefined ? "available" : "pending",
    attempt: run.attempt,
    ...(run.startedAt === undefined ? {} : { startedAt: run.startedAt }),
    ...(run.completedAt === undefined ? {} : { completedAt: run.completedAt }),
    ...(run.request.scheduledFor === undefined ? {} : { scheduledFor: run.request.scheduledFor }),
    ...(run.nextEligibleAt === undefined ? {} : { nextEligibleAt: run.nextEligibleAt }),
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
  if (isRecord(value) && typeof value.code === "string" && typeof value.message === "string") {
    return {
      code: value.code,
      message: value.message,
      ...(isRetry(value.retry) ? { retry: value.retry } : {}),
      ...(typeof value.afterMs === "number" ? { afterMs: value.afterMs } : {}),
    };
  }
  return {
    code: value instanceof Error ? value.name : "RELKIT_TASK_FAILED",
    message: value instanceof Error ? value.message : String(value),
  };
}

export function dedupeKey(request: NativeSubmission): string | undefined {
  return request.idempotencyKey === undefined && request.occurrenceIdentity === undefined
    ? undefined
    : canonicalJson([request.idempotencyKey ?? null, request.occurrenceIdentity ?? null]);
}

export function namespaceOf(context: OperationContext): LocalNativeNamespace {
  return {
    application: context.application,
    environment: context.environment,
    scope: context.scope,
  };
}

export function sameNamespace(run: LocalNativeRun, context: OperationContext): boolean {
  return run.namespace.application === context.application &&
    run.namespace.environment === context.environment &&
    run.namespace.scope === context.scope;
}

export function requestKey(
  request: NativeSubmission,
  context: Pick<OperationContext, "application" | "environment" | "scope">,
): string | undefined {
  const key = dedupeKey(request);
  return key === undefined
    ? undefined
    : canonicalJson([context.application, context.environment, context.scope, request.jobId, key]);
}

export function controlKey(
  kind: "cancel" | "retry",
  runId: string,
  operationId: string,
  context: OperationContext,
): string {
  return canonicalJson([kind, context.application, context.environment, context.scope, runId, operationId]);
}

export function sleepSuspension(key: string, wakeAt: string): LocalSleepSuspension {
  return { code: LOCAL_SLEEP_SUSPENSION_CODE, key, wakeAt };
}

export function isSleepSuspension(value: unknown): value is LocalSleepSuspension {
  return isRecord(value) &&
    value.code === LOCAL_SLEEP_SUSPENSION_CODE &&
    typeof value.key === "string" &&
    typeof value.wakeAt === "string" &&
    Number.isFinite(Date.parse(value.wakeAt));
}

export function terminal(status: RunSnapshot["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "timed-out";
}

function isRetry(value: unknown): value is "never" | "later" {
  return value === "never" || value === "later";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
