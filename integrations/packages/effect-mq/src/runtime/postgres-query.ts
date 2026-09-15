import type { RunSnapshot } from "@relkit/contracts/jobs";
import type { NativeRun, NativeRunQuery } from "@relkit/jobs/adapter";
import { JobStore } from "effect-mq";

export function metadataFilter(query: NativeRunQuery): Readonly<Record<string, unknown>> {
  const metadata: Record<string, string> = {};
  if (query.jobId !== undefined) metadata.relkitJobId = query.jobId;
  if (query.taskId !== undefined) metadata.relkitTaskId = query.taskId;
  if (query.taskVersion !== undefined) metadata.relkitTaskVersion = query.taskVersion;
  if (query.buildId !== undefined) metadata.relkitBuildId = query.buildId;
  if (query.service !== undefined) metadata.relkitService = query.service;
  if (query.correlationId !== undefined) metadata.relkitCorrelationId = query.correlationId;
  if (query.parentRunId !== undefined) metadata.relkitParentRunId = query.parentRunId;
  return { ...(Object.keys(metadata).length === 0 ? {} : { metadata }) };
}

export function states(statuses: NativeRunQuery["status"]): readonly JobStore.JobState[] | undefined {
  if (statuses === undefined) return undefined;
  const values = new Set<JobStore.JobState>();
  for (const status of statuses) {
    if (status === "queued" || status === "retrying") values.add("waiting");
    if (status === "delayed") values.add("delayed");
    if (status === "running") values.add("active");
    if (status === "sleeping") values.add("waiting-children");
    if (status === "completed") values.add("completed");
    if (status === "failed" || status === "timed-out") values.add("failed");
    if (status === "cancelled") values.add("cancelled");
  }
  return [...values];
}

export function matches(query: NativeRunQuery, run: NativeRun): boolean {
  if (query.runId !== undefined && query.runId !== run.runId) return false;
  if (query.status !== undefined && !query.status.includes(run.status)) return false;
  if (query.acceptedFrom !== undefined && run.acceptedAt < query.acceptedFrom) return false;
  if (query.acceptedTo !== undefined && run.acceptedAt > query.acceptedTo) return false;
  if (query.startedFrom !== undefined && (run.startedAt === undefined || run.startedAt < query.startedFrom)) return false;
  if (query.startedTo !== undefined && (run.startedAt === undefined || run.startedAt > query.startedTo)) return false;
  if (query.completedFrom !== undefined && (run.completedAt === undefined || run.completedAt < query.completedFrom)) return false;
  if (query.completedTo !== undefined && (run.completedAt === undefined || run.completedAt > query.completedTo)) return false;
  if (query.tags !== undefined) {
    const tags = (run as unknown as { readonly tags?: readonly string[] }).tags ?? [];
    const matched = query.tagMatch === "all" ? query.tags.every((tag) => tags.includes(tag)) : query.tags.some((tag) => tags.includes(tag));
    if (!matched) return false;
  }
  return true;
}

export function terminal(status: RunSnapshot["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "timed-out";
}

export function terminalState(state: JobStore.JobState): boolean {
  return state === "completed" || state === "failed" || state === "cancelled";
}
