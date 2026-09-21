import { JobStore } from "effect-mq";
import { Effect } from "effect";
import type { ScheduleDefinition } from "@relkit/jobs";
import type { NativeScheduleOperations, OperationContext } from "@relkit/jobs/adapter";
import { durationToMillis } from "@relkit/jobs";

type EffectScheduleRecord = JobStore.ScheduleRecord;
type ScheduleKey = JobStore.ScheduleKey;
const QueueName = JobStore.QueueName;
const ScheduleKey = JobStore.ScheduleKey;

export interface EffectMqScheduleStore {
  readonly listSchedules: (options?: {
    readonly jobName?: string;
    readonly group?: string;
  }) => Effect.Effect<ReadonlyArray<EffectScheduleRecord>, unknown, unknown>;
  readonly upsertSchedule: (
    schedule: EffectScheduleRecord,
  ) => Effect.Effect<void, unknown, unknown>;
  readonly removeSchedule: (key: ScheduleKey) => Effect.Effect<boolean, unknown, unknown>;
}

export interface EffectMqScheduleBridge {
  readonly store: EffectMqScheduleStore;
  readonly run: <A>(effect: Effect.Effect<A, unknown, unknown>) => Promise<A>;
  readonly jobName: string;
  readonly queue?: string;
}

/** Maps effect-mq JobSchedules' native Postgres records to the RELKIT schedule SPI. */
export function createEffectMqScheduleOperations(
  options: EffectMqScheduleBridge,
): NativeScheduleOperations {
  const listRecords = async (
    query: Readonly<Record<string, unknown>>,
  ): Promise<readonly EffectScheduleRecord[]> =>
    options.run(
      options.store.listSchedules({
        jobName: options.jobName,
        ...(typeof query.owner === "string" ? { group: query.owner } : {}),
      }),
    );
  return {
    list: async (query, context) => ({
      schedules: (await listRecords(query))
        .filter((record) => inScope(record, context.scope))
        .map((record) => fromNative(record, options)),
    }),
    get: async (id, context) => {
      const rows = await listRecords({});
      const record = rows.find(
        (entry) =>
          String(entry.key) === scheduleKey(options.jobName, id) && inScope(entry, context.scope),
      );
      return record === undefined
        ? { outcome: "unavailable" }
        : { outcome: "available", schedule: fromNative(record, options) };
    },
    upsert: async (definition, context) => {
      const schedule = definition as ScheduleDefinition & {
        readonly metadata?: Readonly<Record<string, string>>;
      };
      const record = toNative(schedule, options, context);
      await options.run(options.store.upsertSchedule(record));
      return {
        operationId: context.operationId ?? "effect-mq-schedule",
        scheduleId: schedule.id,
        outcome: "updated",
      };
    },
    pause: async (id, context) => unsupported(context.operationId ?? "effect-mq-schedule", id),
    resume: async (id, context) => unsupported(context.operationId ?? "effect-mq-schedule", id),
    delete: async (id, context) => {
      const removed = await options.run(
        options.store.removeSchedule(ScheduleKey(scheduleKey(options.jobName, id))),
      );
      return {
        operationId: context.operationId ?? "effect-mq-schedule",
        scheduleId: id,
        outcome: removed ? "deleted" : "requested",
      };
    },
  };
}

function toNative(
  schedule: ScheduleDefinition & { readonly metadata?: Readonly<Record<string, string>> },
  options: EffectMqScheduleBridge,
  context: OperationContext,
): EffectScheduleRecord {
  if (schedule.overlap !== undefined && schedule.overlap !== "allow") {
    throw new Error(
      `effect-mq schedule "${schedule.id}" does not support overlap=${schedule.overlap}`,
    );
  }
  if (schedule.misfire !== undefined && schedule.misfire !== "skip") {
    throw new Error(
      `effect-mq schedule "${schedule.id}" does not support misfire=${schedule.misfire}`,
    );
  }
  const everyMs = "every" in schedule ? durationToMillis(schedule.every) : undefined;
  const now = Date.now();
  const nextRunAt = JobStore.nextOccurrence(
    {
      cron: "cron" in schedule ? schedule.cron : undefined,
      tz: "cron" in schedule ? schedule.timezone : undefined,
      everyMs,
    },
    now,
    now,
  );
  if (nextRunAt === undefined)
    throw new Error(`effect-mq schedule "${schedule.id}" has an invalid recurrence`);
  return {
    key: ScheduleKey(scheduleKey(options.jobName, schedule.id)),
    jobName: options.jobName,
    queue: QueueName(options.queue ?? "default"),
    cron: "cron" in schedule ? schedule.cron : undefined,
    tz: "cron" in schedule ? schedule.timezone : undefined,
    everyMs,
    payload: { input: { input: schedule.input, metadata: schedule.metadata ?? {} } },
    metadata: schedule.metadata ?? {},
    priority: 0,
    attemptsMax: 1,
    backoff: undefined,
    keep: undefined,
    timeoutMs: undefined,
    group: schedule.metadata?.owner ?? context.scope,
    nextRunAt,
  };
}

function fromNative(record: EffectScheduleRecord, options: EffectMqScheduleBridge) {
  const id = scheduleId(String(record.key), options.jobName);
  const payload = object(record.payload);
  const wrapped = object(payload?.input);
  const input =
    wrapped !== undefined && Object.hasOwn(wrapped, "input") && Object.hasOwn(wrapped, "metadata")
      ? wrapped.input
      : payload !== undefined && Object.hasOwn(payload, "input")
        ? payload.input
        : record.payload;
  const definition: ScheduleDefinition =
    record.cron !== undefined
      ? { id, cron: record.cron, timezone: record.tz ?? "UTC", input }
      : { id, every: everyDuration(record.everyMs), input };
  return {
    id: definition.id,
    jobId: options.jobName,
    state: "active" as const,
    definition,
    metadata: record.metadata,
  };
}

function everyDuration(
  milliseconds: number | undefined,
): Extract<ScheduleDefinition["every"], string> {
  const value = Math.max(1, milliseconds ?? 1_000);
  return (value % 1_000 === 0 ? `${value / 1_000} seconds` : `${value} milliseconds`) as Extract<
    ScheduleDefinition["every"],
    string
  >;
}

function scheduleKey(jobName: string, id: string): string {
  return `${jobName}/${id}`;
}

function scheduleId(key: string, jobName: string): string {
  const prefix = `${jobName}/`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

function unsupported(operationId: string, scheduleId: string) {
  return { operationId, scheduleId, outcome: "unsupported" as const };
}

function inScope(record: EffectScheduleRecord, scope: string): boolean {
  if (scope === "trusted") return true;
  const metadata = record.metadata;
  return (
    metadata !== null &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    metadata.scope === scope
  );
}

function object(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}
