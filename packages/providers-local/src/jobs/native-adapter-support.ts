import { nativeNow } from "../native-services.js";
import type { LocalSleepSuspension } from "./native-adapter-support.types.js";
import { canonicalJson } from "@relkit/contracts";
import type { JobErrorEnvelope, RunSnapshot } from "@relkit/contracts/jobs";
import type { NativeSubmission, OperationContext } from "@relkit/jobs/adapter";
import type { LocalNativeNamespace, LocalNativeRun } from "./native-adapter-types.js";

export type { LocalSleepSuspension } from "./native-adapter-support.types.js";

export const LOCAL_SLEEP_SUSPENSION_CODE = "RELKIT_LOCAL_TASK_SLEEP" as const;

/** Projects a native run into its public snapshot without exposing controllers or internal indexes.
 * @param run - Current persisted native or agent run.
 * @returns The public run snapshot without internal resources.
 */
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
    ...(run.request.inputSchemaHash === undefined
      ? {}
      : { inputSchemaHash: run.request.inputSchemaHash }),
    ...(run.request.acceptanceIdentity === undefined
      ? {}
      : { acceptanceIdentity: run.request.acceptanceIdentity }),
    ...(run.request.scope === undefined ? {} : { scope: run.request.scope }),
    status: run.status,
    observedAt: new Date(nativeNow()).toISOString(),
    resultAvailability:
      run.status === "completed" && run.output !== undefined ? "available" : "pending",
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

/** Normalizes a task rejection into the public failure envelope and retry hint.
 * @param value - Value to validate, normalize or project.
 * @returns The normalized public failure envelope.
 */
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

/** Combines submission and occurrence identities into the stable deduplication key.
 * @param request - Caller domain request.
 * @returns The stable deduplication key, or undefined when no identity was supplied.
 */
export function dedupeKey(request: NativeSubmission): string | undefined {
  return request.idempotencyKey === undefined && request.occurrenceIdentity === undefined
    ? undefined
    : canonicalJson([request.idempotencyKey ?? null, request.occurrenceIdentity ?? null]);
}

/** Copies the application, environment and scope boundary from operation context.
 * @param context - Caller scope, cancellation and operation metadata.
 * @returns The caller namespace copied from operation context.
 */
export function namespaceOf(context: OperationContext): LocalNativeNamespace {
  return {
    application: context.application,
    environment: context.environment,
    scope: context.scope,
  };
}

/** Checks that a native run belongs to the caller application, environment and scope.
 * @param run - Current persisted native or agent run.
 * @param context - Caller scope, cancellation and operation metadata.
 * @returns Whether the run belongs to the caller namespace.
 */
export function sameNamespace(run: LocalNativeRun, context: OperationContext): boolean {
  return (
    run.namespace.application === context.application &&
    run.namespace.environment === context.environment &&
    run.namespace.scope === context.scope
  );
}

/** Scopes submission deduplication to the caller namespace and job.
 * @param request - Caller domain request.
 * @param context - Caller scope, cancellation and operation metadata.
 * @returns The scoped submission key, or undefined for unkeyed submissions.
 */
export function requestKey(
  request: NativeSubmission,
  context: Pick<OperationContext, "application" | "environment" | "scope">,
): string | undefined {
  const key = dedupeKey(request);
  return key === undefined
    ? undefined
    : canonicalJson([context.application, context.environment, context.scope, request.jobId, key]);
}

/** Scopes cancel/retry receipt identity to the namespace, run and operation.
 * @param kind - Declared record or control kind.
 * @param runId - Run identity within its namespace.
 * @param operationId - Caller operation identity for deduplication.
 * @param context - Caller scope, cancellation and operation metadata.
 * @returns The scoped control receipt key.
 */
export function controlKey(
  kind: "cancel" | "retry",
  runId: string,
  operationId: string,
  context: OperationContext,
): string {
  return canonicalJson([
    kind,
    context.application,
    context.environment,
    context.scope,
    runId,
    operationId,
  ]);
}

/** Constructs the durable-sleep marker carrying its key and wake instant.
 * @param key - Application or durable-storage key.
 * @param wakeAt - Durable wake instant as an ISO timestamp.
 * @returns The serializable durable-sleep marker.
 */
export function sleepSuspension(key: string, wakeAt: string): LocalSleepSuspension {
  return { code: LOCAL_SLEEP_SUSPENSION_CODE, key, wakeAt };
}

/** Validates a task suspension marker before changing persisted run state.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a valid durable-sleep marker.
 */
export function isSleepSuspension(value: unknown): value is LocalSleepSuspension {
  return (
    isRecord(value) &&
    value.code === LOCAL_SLEEP_SUSPENSION_CODE &&
    typeof value.key === "string" &&
    typeof value.wakeAt === "string" &&
    Number.isFinite(Date.parse(value.wakeAt))
  );
}

/** Checks whether the native run can no longer accept worker completion.
 * @param status - Public lifecycle status.
 * @returns Whether the run status is terminal.
 */
export function terminal(status: RunSnapshot["status"]): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "timed-out"
  );
}

/** Checks the supported retry classifications in an unknown failure envelope.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a supported retry hint.
 */
function isRetry(value: unknown): value is "never" | "later" {
  return value === "never" || value === "later";
}

/** Checks for a non-null, non-array object before inspecting unknown fields.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
