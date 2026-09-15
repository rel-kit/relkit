import type { JsonValue } from "@relkit/contracts";
import type { NativeScheduleOperations, OperationContext } from "@relkit/jobs/adapter";
import { Effect } from "effect";
import { JobStore } from "effect-mq";
import { createEffectMqScheduleOperations } from "./schedules.js";
import type { EffectMqPostgresState } from "./postgres-state.js";

export function createEffectMqPostgresSchedules(
  getState: () => EffectMqPostgresState,
  queue: string | undefined,
): NativeScheduleOperations {
  const owners = new Map<string, string>();
  const bridge = (jobName: string) => createEffectMqScheduleOperations({
    jobName,
    ...(queue === undefined ? {} : { queue }),
    store: {
      listSchedules: (options) => Effect.flatMap(JobStore.JobStore, (store) => store.listSchedules(options)),
      upsertSchedule: (schedule) => Effect.flatMap(JobStore.JobStore, (store) => store.upsertSchedule(schedule)),
      removeSchedule: (key) => Effect.flatMap(JobStore.JobStore, (store) => store.removeSchedule(key)),
    },
    run: (effect) => getState().run(effect),
  });
  const ownerFor = async (id: string, context: OperationContext): Promise<string | undefined> => {
    const known = owners.get(id);
    if (known !== undefined) {
      return available(await bridge(known).get(id, context)) ? known : undefined;
    }
    for (const jobName of getState().definitions.keys()) {
      const result = await bridge(jobName).get(id, context);
      if (available(result)) {
        owners.set(id, jobName);
        return jobName;
      }
    }
    return undefined;
  };
  return {
    list: async (query, context) => {
      const names = typeof query.jobId === "string"
        ? [query.jobId]
        : [...getState().definitions.keys()];
      const pages = await Promise.all(names.map((name) => bridge(name).list(query, context)));
      const schedules = pages.flatMap((page) => {
        const rows = page && typeof page === "object" && Array.isArray((page as { schedules?: unknown }).schedules)
          ? (page as { schedules: readonly Record<string, unknown>[] }).schedules
          : [];
        for (const row of rows) if (typeof row.id === "string" && typeof row.jobId === "string") owners.set(row.id, row.jobId);
        return rows;
      });
      return { schedules };
    },
    get: async (id, context) => {
      const jobName = await ownerFor(id, context);
      return jobName === undefined ? { outcome: "unavailable" } : bridge(jobName).get(id, context);
    },
    upsert: async (definition, context) => {
      const jobName = metadataJobId(definition);
      if (jobName === undefined) throw new Error("Effect MQ schedule metadata is missing jobId");
      owners.set(scheduleId(definition), jobName);
      return bridge(jobName).upsert(definition, context);
    },
    pause: (id, context) => operationUnsupported(id, context),
    resume: (id, context) => operationUnsupported(id, context),
    delete: async (id, context) => {
      const jobName = await ownerFor(id, context);
      return jobName === undefined
        ? { operationId: context.operationId ?? "effect-mq-schedule", scheduleId: id, outcome: "requested" as const }
        : bridge(jobName).delete(id, context);
    },
  };
}

function metadataJobId(value: JsonValue): string | undefined {
  const record = object(value);
  const metadata = object(record?.metadata);
  return typeof metadata?.jobId === "string" && metadata.jobId !== "" ? metadata.jobId : undefined;
}

function scheduleId(value: JsonValue): string {
  const record = object(value);
  return typeof record?.id === "string" ? record.id : "unknown";
}

function operationUnsupported(id: string, context: OperationContext) {
  return Promise.resolve({ operationId: context.operationId ?? "effect-mq-schedule", scheduleId: id, outcome: "unsupported" as const });
}

function object(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : undefined;
}

function available(value: unknown): boolean {
  return object(value)?.outcome === "available";
}
