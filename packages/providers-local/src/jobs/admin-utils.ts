import { deepFreeze, normalizeId } from "@zsys/contracts";
import { JobAdminError } from "./admin-errors.js";
import {
  JOB_ADMIN_PROTOCOL,
  JOB_ADMIN_VERSION,
  type JobActionRequest,
  type JobActionContract,
  type JobAdminAction,
  type JobAdminActionRecord,
  type JobAdminActionSink,
  type JobAdminMode,
  type JobAdminVersion,
  type JobQueryRequest,
  type JobStatusContract,
} from "./admin-contracts.js";
import type { JobQueueEntry } from "./queue-utils.js";

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

export function matches(entry: JobQueueEntry, request: JobQueryRequest): boolean {
  if (request.instanceId !== undefined && entry.instanceId !== normalizeId(request.instanceId))
    return false;
  const states = request.states ?? (request.state === undefined ? undefined : [request.state]);
  return states === undefined || states.includes(entry.state);
}

export function afterCursor(entry: JobQueueEntry, value: string | undefined): boolean {
  if (value === undefined) return true;
  const [order, instanceId] = value.split(":", 2);
  const parsed = Number(order);
  if (!Number.isSafeInteger(parsed) || instanceId === undefined)
    throw newAdminError("ZSYS_JOB_ADMIN_CURSOR_INVALID", "Job query cursor is invalid");
  return entry.order > parsed || (entry.order === parsed && entry.instanceId > instanceId);
}

export function cursor(entry: JobQueueEntry): string {
  return `${entry.order}:${entry.instanceId}`;
}

export function pageLimit(value: number | undefined): number {
  if (value === undefined) return 50;
  if (!Number.isSafeInteger(value) || value < 1)
    throw newAdminError("ZSYS_JOB_ADMIN_QUERY_INVALID", "Job query limit is invalid");
  return Math.min(value, 100);
}

export function validateQuery(request: JobQueryRequest): void {
  if (request.state !== undefined && !isState(request.state))
    throw newAdminError("ZSYS_JOB_ADMIN_QUERY_INVALID", "Job query state is invalid");
  if (
    request.states !== undefined &&
    (!Array.isArray(request.states) || request.states.some((state) => !isState(state)))
  )
    throw newAdminError("ZSYS_JOB_ADMIN_QUERY_INVALID", "Job query states are invalid");
}

export function failureFor(action: JobAdminAction) {
  return {
    kind: action === "cancel" ? "cancellation" : "provider",
    outcome: action === "cancel" ? "cancelled" : "provider-failure",
    code: action === "cancel" ? "ZSYS_JOB_ADMIN_CANCELLED" : "ZSYS_JOB_ADMIN_DEAD_LETTERED",
    message:
      action === "cancel"
        ? "Job cancelled by local development action"
        : "Job dead-lettered by local development action",
    retry: "never",
  } as const;
}

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

export function versioned<T extends object>(value: T): T & JobAdminVersion {
  return deepFreeze({ protocol: JOB_ADMIN_PROTOCOL, version: JOB_ADMIN_VERSION, ...value });
}

export function assertVersion(value: unknown): void {
  if (!isRecord(value))
    throw newAdminError("ZSYS_JOB_ADMIN_REQUEST_INVALID", "Job admin request is invalid");
  if (
    (value.protocol !== undefined && value.protocol !== JOB_ADMIN_PROTOCOL) ||
    (value.version !== undefined && value.version !== JOB_ADMIN_VERSION)
  )
    throw newAdminError("ZSYS_JOB_ADMIN_PROTOCOL_MISMATCH", "Unsupported job admin protocol");
}

export function assertMode(value: string): asserts value is JobAdminMode {
  if (value !== "development" && value !== "test" && value !== "production")
    throw newAdminError("ZSYS_JOB_ADMIN_MODE_INVALID", "Job admin mode is invalid");
}

export function safeId(value: unknown): string | undefined {
  try {
    return normalizeId(value);
  } catch {
    return undefined;
  }
}

export function readReason(value: unknown): string | undefined {
  if (!isRecord(value) || value.reason === undefined) return undefined;
  if (typeof value.reason !== "string" || value.reason.trim() === "")
    throw newAdminError("ZSYS_JOB_ADMIN_REQUEST_INVALID", "Job action reason is invalid");
  return value.reason.trim().slice(0, 256);
}

export function safeReason(value: unknown): string | undefined {
  try {
    return readReason(value);
  } catch {
    return undefined;
  }
}

export function safeError(value: unknown): JobAdminError {
  return value instanceof JobAdminError
    ? value
    : newAdminError("ZSYS_JOB_ADMIN_ACTION_FAILED", "Job admin action failed");
}

function isState(value: unknown): value is JobQueueEntry["state"] {
  return ["accepted", "available", "leased", "delayed", "completed", "dead-lettered"].includes(
    value as string,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function newAdminError(code: string, message: string): JobAdminError {
  return new JobAdminError(code, message);
}
