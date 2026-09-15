import { assertJsonValue, canonicalJson } from "@relkit/contracts";
import type { ScheduleDefinition } from "./job-types.js";
import type { NativeScheduleOperations, OperationContext } from "./adapter.js";
import { stableIdentityTuple } from "./identity.js";

export interface NativeOwnedScheduleRecord {
  readonly id: string;
  readonly state?: "active" | "paused" | "missing" | "unknown";
  readonly definition?: ScheduleDefinition;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ScheduleReconciliationResult {
  readonly upserted: readonly string[];
  readonly deleted: readonly string[];
  readonly preserved: readonly string[];
}

export interface ScheduleReconciliationOptions {
  readonly native: NativeScheduleOperations;
  readonly desired: readonly ScheduleDefinition[];
  readonly existing?: readonly NativeOwnedScheduleRecord[];
  readonly context: OperationContext;
  readonly jobId: string;
  readonly taskId?: string;
  readonly taskVersion?: string;
  readonly buildId: string;
  readonly workerReady?: (() => Promise<void>) | undefined;
}

/**
 * Reconcile only schedules owned by this application/environment/service/job.
 * Native writes receive stable operation ids, so a retry after an interrupted
 * response converges to one native schedule rather than creating a duplicate.
 */
export async function reconcileNativeSchedules(
  options: ScheduleReconciliationOptions,
): Promise<ScheduleReconciliationResult> {
  await options.workerReady?.();
  const existing = options.existing ?? await readExisting(options);
  const byId = new Map(existing.map((record) => [record.id, record]));
  const upserted: string[] = [];
  const deleted: string[] = [];
  const preserved: string[] = [];
  const desiredIds = new Set(options.desired.map((schedule) => schedule.id));

  for (const schedule of options.desired) {
    const current = byId.get(schedule.id);
    if (current !== undefined && !ownedBy(current, options)) {
      throw new Error(`RELKIT_SCHEDULE_OWNERSHIP_CONFLICT:${schedule.id}`);
    }
    const definition = nativeDefinition(schedule, options);
    await writeWithRecovery(
      () => options.native.upsert(definition as unknown as import("@relkit/contracts").JsonValue, writeContext(options.context, operationId(options, schedule.id))),
      options.context,
    );
    if (current?.state === "paused") {
      await writeWithRecovery(
        () => options.native.pause(schedule.id, writeContext(options.context, operationId(options, schedule.id + ":pause"))),
        options.context,
      );
    }
    upserted.push(schedule.id);
  }

  for (const record of existing) {
    if (!ownedBy(record, options)) {
      preserved.push(record.id);
      continue;
    }
    if (desiredIds.has(record.id)) continue;
    await writeWithRecovery(
      () => options.native.delete(record.id, writeContext(options.context, operationId(options, record.id))),
      options.context,
    );
    deleted.push(record.id);
  }
  return Object.freeze({ upserted, deleted, preserved });
}

export function scheduleOwner(options: Pick<ScheduleReconciliationOptions, "context" | "jobId">): string {
  return stableIdentityTuple([
    "relkit.schedule.owner",
    options.context.application,
    options.context.environment,
    options.context.service,
    options.jobId,
  ]);
}

export function scheduleOperationId(
  options: Pick<ScheduleReconciliationOptions, "context" | "jobId" | "buildId">,
  scheduleId: string,
): string {
  return stableIdentityTuple([
    "relkit.schedule.operation",
    scheduleOwner(options),
    scheduleId,
    options.buildId,
  ]);
}

async function readExisting(options: ScheduleReconciliationOptions): Promise<readonly NativeOwnedScheduleRecord[]> {
  const value = await options.native.list(
    { scope: options.context.scope, jobId: options.jobId },
    options.context,
  );
  if (!isRecord(value) || !Array.isArray(value.schedules)) return [];
  return value.schedules.filter(isScheduleRecord);
}

function nativeDefinition(
  schedule: ScheduleDefinition,
  options: ScheduleReconciliationOptions,
): ScheduleDefinition & { readonly metadata: Readonly<Record<string, string>> } {
  assertJsonValue(schedule.input);
  const canonicalInput = canonicalJson(schedule.input);
  return Object.freeze({
    ...schedule,
    metadata: Object.freeze({
      owner: scheduleOwner(options),
      application: options.context.application,
      environment: options.context.environment,
      service: options.context.service,
      scope: options.context.scope,
      jobId: options.jobId,
      ...(options.taskId === undefined ? {} : { taskId: options.taskId }),
      ...(options.taskVersion === undefined ? {} : { taskVersion: options.taskVersion }),
      buildId: options.buildId,
      serviceGeneration: options.context.serviceGeneration,
      canonicalInput,
    }),
  });
}

async function writeWithRecovery(
  write: () => Promise<unknown>,
  context: OperationContext,
): Promise<unknown> {
  let lastUnknown = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await write();
      if (isUnsupported(result)) throw new Error("RELKIT_SCHEDULE_UNSUPPORTED:" + (context.operationId ?? "operation"));
      if (!isUnknown(result)) return result;
      lastUnknown = true;
    } catch (error) {
      if (!isAmbiguous(error)) throw error;
      lastUnknown = true;
    }
  }
  if (lastUnknown) throw new Error("RELKIT_SCHEDULE_WRITE_UNKNOWN:" + (context.operationId ?? "operation"));
  throw new Error("RELKIT_SCHEDULE_WRITE_FAILED");
}

function writeContext(context: OperationContext, operationIdValue: string): OperationContext {
  return Object.freeze({ ...context, operationId: operationIdValue });
}

function operationId(options: ScheduleReconciliationOptions, scheduleId: string): string {
  return scheduleOperationId(options, scheduleId);
}

function ownedBy(record: NativeOwnedScheduleRecord, options: ScheduleReconciliationOptions): boolean {
  const owner = record.metadata?.owner;
  return owner === scheduleOwner(options);
}

function isScheduleRecord(value: unknown): value is NativeOwnedScheduleRecord {
  return isRecord(value) && typeof value.id === "string";
}

function isUnknown(value: unknown): boolean {
  return isRecord(value) && value.outcome === "unknown";
}

function isUnsupported(value: unknown): boolean {
  return isRecord(value) && value.outcome === "unsupported";
}

function isAmbiguous(value: unknown): boolean {
  return !(value instanceof Error && /^4\d\d/u.test(value.message));
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
