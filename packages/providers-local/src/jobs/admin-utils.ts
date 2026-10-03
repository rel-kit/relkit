import {
  pageLimit,
  validateQuery,
  assertVersion,
  assertMode,
  safeId,
  readReason,
  safeReason,
  safeError,
  newAdminError,
} from "./admin-validation.js";
import { deepFreeze, normalizeId } from "@relkit/contracts";
import {
  JOB_ADMIN_PROTOCOL,
  JOB_ADMIN_VERSION,
  type JobAdminAction,
  type JobAdminActionRecord,
  type JobAdminActionSink,
  type JobAdminMode,
  type JobAdminVersion,
  type JobQueryRequest,
  type JobStatusContract,
} from "./admin-contracts.js";
import type { JobQueueEntry } from "./queue-utils.js";

export {
  pageLimit,
  validateQuery,
  assertVersion,
  assertMode,
  safeId,
  readReason,
  safeReason,
  safeError,
} from "./admin-validation.js";

/** Projects a queue entry into versioned inspection fields without exposing payloads.
 * @param entry - Current queue or storage entry.
 * @returns The immutable public status projection.
 */
export function toStatus(entry: JobQueueEntry): JobStatusContract {
  return versioned({
    instanceId: entry.instanceId,
    state: entry.state,
    profile: entry.profile,
    attempt: entry.attempt,
    acceptedAt: entry.acceptedAt,
    order: entry.order,
    ...(entry.availableAt === undefined ? {} : { availableAt: entry.availableAt }),
    ...(entry.leaseExpiresAt === undefined ? {} : { leaseExpiresAt: entry.leaseExpiresAt }),
    ...(entry.idempotency === undefined
      ? {}
      : { idempotencyExpiresAt: entry.idempotency.expiresAt }),
    ...(entry.failure === undefined ? {} : { failure: entry.failure }),
  });
}

/** Applies optional identity and state filters to a candidate record.
 * @param entry - Current queue or storage entry.
 * @param request - Caller domain request.
 * @returns Whether the candidate satisfies all supplied filters.
 */
export function matches(entry: JobQueueEntry, request: JobQueryRequest): boolean {
  if (request.instanceId !== undefined && entry.instanceId !== normalizeId(request.instanceId))
    return false;
  const states = request.states ?? (request.state === undefined ? undefined : [request.state]);
  return states === undefined || states.includes(entry.state);
}

/** Validates the cursor and selects records strictly after its stable ordering key.
 * @param entry - Current queue or storage entry.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the record sorts strictly after the validated cursor.
 */
export function afterCursor(entry: JobQueueEntry, value: string | undefined): boolean {
  if (value === undefined) return true;
  const [order, instanceId] = value.split(":", 2);
  const parsed = Number(order);
  if (!Number.isSafeInteger(parsed) || instanceId === undefined)
    throw newAdminError("RELKIT_JOB_ADMIN_CURSOR_INVALID", "Job query cursor is invalid");
  return entry.order > parsed || (entry.order === parsed && entry.instanceId > instanceId);
}

/** Encodes an entry ordering key for the next inspection page.
 * @param entry - Current queue or storage entry.
 * @returns The stable continuation cursor.
 */
export function cursor(entry: JobQueueEntry): string {
  return `${entry.order}:${entry.instanceId}`;
}

/** Builds the safe public failure describing an administrator cancellation or dead-letter action.
 * @param action - Requested administration action.
 * @returns Safe failure metadata for the requested administrative action.
 */
export function failureFor(action: JobAdminAction) {
  return {
    kind: action === "cancel" ? "cancellation" : "provider",
    outcome: action === "cancel" ? "cancelled" : "provider-failure",
    code: action === "cancel" ? "RELKIT_JOB_ADMIN_CANCELLED" : "RELKIT_JOB_ADMIN_DEAD_LETTERED",
    message:
      action === "cancel"
        ? "Job cancelled by local development action"
        : "Job dead-lettered by local development action",
    retry: "never",
  } as const;
}

/** Builds the versioned audit record with prior/next state and a bounded rejection code.
 * @param action - Requested administration action.
 * @param actionId - Stable audit action identity.
 * @param instanceId - Queue or journal instance identity.
 * @param requestedAt - Action request clock time in milliseconds.
 * @param outcome - Recorded operation outcome.
 * @param mode - Local administration environment mode.
 * @param before - State before the attempted transition.
 * @param after - State after the attempted transition.
 * @param errorCode - Safe public failure code.
 * @param reason - Optional bounded audit reason.
 * @returns The validated immutable durable or audit record.
 */
export function makeRecord(
  action: JobAdminAction,
  actionId: string,
  instanceId: string,
  requestedAt: number,
  outcome: "applied" | "rejected",
  mode: JobAdminMode,
  before: JobQueueEntry | undefined,
  after: JobQueueEntry | undefined,
  errorCode?: string,
  reason?: string,
): JobAdminActionRecord {
  return versioned({
    actionId,
    action,
    instanceId,
    mode,
    outcome,
    requestedAt,
    ...(before === undefined ? {} : { fromState: before.state }),
    ...(after === undefined ? {} : { toState: after.state }),
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(reason === undefined ? {} : { reason }),
  });
}

/** Stores the audit record before invoking its isolated optional sink.
 * @param options - Operation-specific policy, hooks and configuration.
 * @param record - Durable record or audit entry.
 * @returns The recorded audit entry, even if the optional sink fails.
 */
export async function recordAction(
  options: { readonly onAction?: JobAdminActionSink; readonly records: JobAdminActionRecord[] },
  record: JobAdminActionRecord,
): Promise<JobAdminActionRecord> {
  options.records.push(record);
  try {
    await options.onAction?.(record);
  } catch {
    // A failing sink cannot erase the local action record or change its result.
  }
  return record;
}

/** Adds protocol/version identity and freezes the public response.
 * @param value - Value to validate, normalize or project.
 * @returns The frozen value carrying the administration protocol identity.
 * @typeParam T - Shape preserved by this operation.
 */
export function versioned<T extends object>(value: T): T & JobAdminVersion {
  return deepFreeze({ protocol: JOB_ADMIN_PROTOCOL, version: JOB_ADMIN_VERSION, ...value });
}
