import { assertJsonValue, canonicalJson } from "@relkit/contracts";
import type {
  ScheduleDefinition,
  ScheduleListOptions,
  ScheduleReadReceipt,
  ScheduleWriteOptions,
  ScheduleWriteReceipt,
  JobScheduleClient,
} from "./job-types.js";
import { assertJobsCapability, JobsCapabilityError } from "./capabilities.js";
import type { NativeScheduleOperations } from "./adapter.js";
import { JobControlUnknownError } from "./control-errors.js";
import { unknownRecovery } from "./control-support.js";
import { controlWrite } from "./control-write.js";
import { requireJobsRuntime, type JobsRuntime } from "./runtime.js";

export function createScheduleControls(runtime = requireJobsRuntime()): JobScheduleClient {
  const schedule = runtime.adapter.schedules;
  if (schedule === undefined) throw new JobsCapabilityError("schedules");
  return Object.freeze({
    list: (options?: ScheduleListOptions) => listSchedules(runtime, schedule, options),
    get: (id: string, options?: { readonly signal?: AbortSignal }) => getSchedule(runtime, schedule, id, options?.signal),
    upsert: (definition: ScheduleDefinition, options: ScheduleWriteOptions) =>
      writeSchedule(runtime, schedule, definition, options, "upsert"),
    pause: (id: string, options: ScheduleWriteOptions) => writeSchedule(runtime, schedule, id, options, "pause"),
    resume: (id: string, options: ScheduleWriteOptions) => writeSchedule(runtime, schedule, id, options, "resume"),
    delete: (id: string, options: ScheduleWriteOptions) => writeSchedule(runtime, schedule, id, options, "delete"),
  });
}

async function listSchedules(
  runtime: JobsRuntime,
  schedule: NativeScheduleOperations,
  options: ScheduleListOptions | undefined,
): Promise<ScheduleReadReceipt> {
  requireScheduleCapability(runtime);
  const limit = options?.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Schedule list limit must be between 1 and 100");
  const value = await schedule.list({
    limit,
    ...(options?.cursor === undefined ? {} : { cursor: boundedCursor(options.cursor) }),
  }, runtime.operationContext({ signal: options?.signal ?? idleSignal() }));
  return normalizeRead(value);
}

async function getSchedule(
  runtime: JobsRuntime,
  schedule: NativeScheduleOperations,
  id: string,
  signal: AbortSignal | undefined,
): Promise<ScheduleReadReceipt> {
  requireScheduleCapability(runtime);
  const value = await schedule.get(boundedId(id), runtime.operationContext({ signal: signal ?? idleSignal() }));
  return normalizeRead(value);
}

async function writeSchedule(
  runtime: JobsRuntime,
  schedule: NativeScheduleOperations,
  value: ScheduleDefinition | string,
  options: ScheduleWriteOptions,
  operation: "upsert" | "pause" | "resume" | "delete",
): Promise<ScheduleWriteReceipt> {
  requireScheduleCapability(runtime);
  const operationId = boundedId(options.operationId);
  const scheduleId = typeof value === "string" ? boundedId(value) : boundedId(value.id);
  if (typeof value !== "string") assertJsonValue(value);
  const call = () => operation === "upsert"
    ? schedule.upsert(JSON.parse(canonicalJson(value)) as never, runtime.operationContext({ signal: options.signal ?? idleSignal(), operationId }))
    : schedule[operation](scheduleId, runtime.operationContext({ signal: options.signal ?? idleSignal(), operationId }));
  const result = await controlWrite(call, options.signal, operationId);
  if (isUnknown(result)) throw new JobControlUnknownError(result.operationId || operationId, result.idempotencyKey, unknownRecovery(result));
  if (!isRecord(result) || result.operationId !== operationId || result.scheduleId !== scheduleId || !isOutcome(result.outcome)) {
    throw new TypeError("Native schedule receipt is invalid");
  }
  return Object.freeze(result as ScheduleWriteReceipt);
}

function requireScheduleCapability(runtime: JobsRuntime): void {
  if (runtime.adapter.schedules === undefined) throw new JobsCapabilityError("schedules");
  assertJobsCapability(runtime.capabilities, "schedules");
}

function normalizeRead(value: unknown): ScheduleReadReceipt {
  if (!isRecord(value) || (value.outcome !== "available" && value.outcome !== "unavailable")) {
    throw new TypeError("Native schedule read receipt is invalid");
  }
  return Object.freeze(value as unknown as ScheduleReadReceipt);
}

function isOutcome(value: unknown): boolean {
  return value === "created" || value === "updated" || value === "paused" || value === "resumed" ||
    value === "deleted" || value === "requested" || value === "unsupported";
}

function isUnknown(value: unknown): value is { readonly operationId: string; readonly idempotencyKey?: string; readonly outcome: "unknown" } {
  return isRecord(value) && value.outcome === "unknown" && typeof value.operationId === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedId(value: string): string {
  if (typeof value !== "string" || value.length === 0 || new TextEncoder().encode(value).byteLength > 256) throw new TypeError("Schedule identifiers must be bounded non-empty strings");
  return value;
}

function boundedCursor(value: string): string {
  if (new TextEncoder().encode(value).byteLength > 4096) throw new RangeError("Schedule cursor is too large");
  return value;
}

function idleSignal(): AbortSignal {
  return new AbortController().signal;
}
