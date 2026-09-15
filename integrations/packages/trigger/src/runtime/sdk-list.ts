import type { NativeRun, NativeRunPage, NativeRunQuery, OperationContext } from "@relkit/jobs/adapter";
import type { TriggerSdkApi } from "./native.js";
import { triggerTaskIdentifier } from "./sdk-support.js";
import { record, triggerSnapshot } from "./sdk-mapping.js";

export async function listRuns(
  client: TriggerSdkApi,
  projectRef: string,
  query: NativeRunQuery,
  context: OperationContext,
): Promise<NativeRunPage> {
  if (query.service !== undefined && query.service !== context.service) return emptyPage();
  if (query.runId !== undefined) {
    const raw = await client.runs.retrieve(query.runId, { signal: context.signal });
    const run = triggerSnapshot(raw, context, query.runId);
    return belongsToContext(raw, run, context) && matches(run, query)
      ? { items: [run], hasMore: false, availability: [], count: { value: 1, accuracy: "exact" } }
      : emptyPage();
  }
  const response = await client.runs.list(projectRef, listParams(query), { signal: context.signal });
  const page = record(response);
  const rows = Array.isArray(page?.data) ? page.data : [];
  const items = rows
    .filter((row) => record(row) !== undefined)
    .map((row) => ({ raw: row, run: triggerSnapshot(row, context) }))
    .filter(({ raw, run }) => belongsToContext(raw, run, context) && matches(run, query))
    .map(({ run }) => run);
  const nextCursor = textOptional(record(page?.pagination)?.next);
  return {
    items,
    ...(nextCursor === undefined ? {} : { nextCursor }),
    hasMore: nextCursor !== undefined,
    availability: [],
    count: { value: items.length, accuracy: "approximate" },
  };
}

function emptyPage(): NativeRunPage {
  return { items: [], hasMore: false, availability: [], count: { value: 0, accuracy: "exact" } };
}

function listParams(query: NativeRunQuery): Record<string, unknown> {
  const params: Record<string, unknown> = { limit: query.limit ?? 25 };
  if (query.status !== undefined) params.status = query.status.map(triggerStatus);
  if (query.jobId !== undefined && query.taskId !== undefined && query.taskVersion !== undefined && query.buildId !== undefined) {
    params.taskIdentifier = triggerTaskIdentifier({ jobId: query.jobId, taskId: query.taskId, taskVersion: query.taskVersion, buildId: query.buildId });
  }
  if (query.taskVersion !== undefined) params.version = query.taskVersion;
  if (query.acceptedFrom !== undefined) params.from = date(query.acceptedFrom, "acceptedFrom");
  if (query.acceptedTo !== undefined) params.to = date(query.acceptedTo, "acceptedTo");
  if (query.tags !== undefined) params.tag = query.tags;
  if (query.cursor !== undefined) params.after = query.cursor;
  return params;
}

function matches(run: NativeRun, query: NativeRunQuery): boolean {
  if (query.status !== undefined && !query.status.includes(run.status)) return false;
  if (query.jobId !== undefined && run.jobId !== query.jobId) return false;
  if (query.taskId !== undefined && run.taskId !== query.taskId) return false;
  if (query.taskVersion !== undefined && run.taskVersion !== query.taskVersion) return false;
  if (query.buildId !== undefined && run.buildId !== query.buildId) return false;
  if (query.service !== undefined && run.service !== query.service) return false;
  if (query.acceptedFrom !== undefined && run.acceptedAt < query.acceptedFrom) return false;
  if (query.acceptedTo !== undefined && run.acceptedAt > query.acceptedTo) return false;
  if (query.startedFrom !== undefined && (run.startedAt === undefined || run.startedAt < query.startedFrom)) return false;
  if (query.startedTo !== undefined && (run.startedAt === undefined || run.startedAt > query.startedTo)) return false;
  if (query.completedFrom !== undefined && (run.completedAt === undefined || run.completedAt < query.completedFrom)) return false;
  if (query.completedTo !== undefined && (run.completedAt === undefined || run.completedAt > query.completedTo)) return false;
  const details = run as unknown as Record<string, unknown>;
  if (query.correlationId !== undefined && details.correlationId !== query.correlationId) return false;
  if (query.parentRunId !== undefined && run.parentRunId !== query.parentRunId) return false;
  if (query.tags !== undefined) {
    const tags = Array.isArray(details.tags) ? details.tags.filter((tag): tag is string => typeof tag === "string") : [];
    const matched = query.tagMatch === "all" ? query.tags.every((tag) => tags.includes(tag)) : query.tags.some((tag) => tags.includes(tag));
    if (!matched) return false;
  }
  return true;
}

function belongsToContext(value: unknown, run: NativeRun, context: OperationContext): boolean {
  const metadata = record(record(value)?.metadata);
  return metadata !== undefined &&
    metadata.relkitApplication === context.application &&
    metadata.relkitEnvironment === context.environment &&
    metadata.relkitService === context.service &&
    metadata.relkitJobId === run.jobId &&
    (context.scope === "trusted" || metadata.relkitScope === context.scope);
}

function triggerStatus(value: string): string {
  const map: Record<string, string> = {
    queued: "QUEUED", delayed: "DELAYED", running: "EXECUTING", sleeping: "WAITING", retrying: "QUEUED",
    completed: "COMPLETED", failed: "FAILED", cancelled: "CANCELED", "timed-out": "TIMED_OUT", unknown: "QUEUED",
  };
  return map[value] ?? value;
}

function date(value: string, name: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`Trigger ${name} is invalid`);
  return parsed;
}

function textOptional(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
