import type { InspectorObject } from "./api-types";

export const RUN_STATES = [
  "queued",
  "delayed",
  "running",
  "sleeping",
  "retrying",
  "completed",
  "failed",
  "cancelled",
  "timed-out",
  "unknown",
] as const;
export type JobRunState = (typeof RUN_STATES)[number];
export type JobRunCounts = Readonly<Record<JobRunState, number>>;

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

export function runCounts(items: readonly InspectorObject[]): JobRunCounts {
  const counts = Object.fromEntries(RUN_STATES.map((state) => [state, 0])) as Record<
    JobRunState,
    number
  >;
  for (const item of items) {
    const state = text(item.status);
    if ((RUN_STATES as readonly string[]).includes(state)) counts[state as JobRunState] += 1;
  }
  return counts;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
