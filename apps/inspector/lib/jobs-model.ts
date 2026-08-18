import type { InspectorObject } from "./api-types";

export const JOB_STATES = [
  "accepted",
  "available",
  "leased",
  "delayed",
  "completed",
  "dead-lettered",
] as const;

export type JobState = (typeof JOB_STATES)[number];
export type JobQueueCounts = Readonly<Record<JobState, number>>;

export function itemsForJob(
  items: readonly InspectorObject[],
  jobId: string,
  knownJobIds: readonly string[],
): readonly InspectorObject[] {
  const keyed = items.filter((item) => text(item.jobId) !== "");
  if (keyed.length > 0) return keyed.filter((item) => text(item.jobId) === jobId);
  if (knownJobIds.length === 1) return items;
  return items.filter((item) => text(item.id) === jobId);
}

export function queueCounts(items: readonly InspectorObject[]): JobQueueCounts {
  const counts = Object.fromEntries(JOB_STATES.map((state) => [state, 0])) as Record<
    JobState,
    number
  >;
  for (const item of items) {
    const state = text(item.state);
    if (isJobState(state)) counts[state] += 1;
  }
  return counts;
}

export function nextRunValue(
  job: InspectorObject,
  items: readonly InspectorObject[],
  scheduleId?: string,
): unknown {
  const schedules = items.flatMap((item) => records(item.schedules));
  const match = schedules.find(
    (schedule) => scheduleId === undefined || text(schedule.id) === scheduleId,
  );
  return (
    match?.nextRunAt ??
    match?.nextFireAt ??
    match?.nextRun ??
    job.nextRunAt ??
    job.nextFireAt ??
    items.find((item) => item.nextRunAt !== undefined)?.nextRunAt ??
    items.find((item) => item.nextFireAt !== undefined)?.nextFireAt
  );
}

function isJobState(value: string): value is JobState {
  return (JOB_STATES as readonly string[]).includes(value);
}

function records(value: unknown): InspectorObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is InspectorObject => isRecord(item))
    : [];
}

function isRecord(value: unknown): value is InspectorObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
