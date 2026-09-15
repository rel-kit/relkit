import type { RunListQuery, RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import type {
  NativeLocator,
  OperationContext,
} from "@relkit/jobs/adapter";
import { rememberInngestRecord, snapshot, type InngestRunApi, type InngestRunMetadata } from "./runs.js";
import {
  decodeCursor,
  encodeCursor,
  matchesMetadata,
  matchesSnapshot,
  normalizeLimit,
  uniqueRecords,
} from "./run-query.js";

export async function readInngestRun(
  locator: NativeLocator,
  context: OperationContext,
  api: InngestRunApi,
  records: Map<string, InngestRunMetadata>,
): Promise<RunSnapshot> {
  const metadata = records.get(locator.replace(/^event:/u, ""));
  if (locator.startsWith("event:")) {
    const eventId = locator.slice("event:".length);
    const rows = await api.eventRuns(eventId, context.signal);
    if (rows.length > 1) throw new Error(`Inngest event "${eventId}" matched multiple native runs.`);
    if (rows.length === 0) return queued(records.get(eventId) ?? unknownMetadata(eventId, context));
    const native = rows[0]!;
    const nativeId = text(native.id ?? native.run_id, "Inngest run id");
    const resolved = records.get(eventId);
    if (resolved === undefined) return snapshot(native, { ...unknownMetadata(eventId, context), runId: nativeId });
    const promoted = { ...resolved, runId: nativeId };
    for (const [key, value] of records) {
      if (value.eventId === resolved.eventId && value.runId.startsWith("event:")) records.delete(key);
    }
    rememberInngestRecord(records, eventId, promoted);
    rememberInngestRecord(records, nativeId, promoted);
    return snapshot(native, promoted);
  }
  const native = await api.run(locator, context.signal);
  return snapshot(native, { ...(metadata ?? unknownMetadata(locator, context)), runId: locator });
}

export async function listInngestRuns(
  query: RunListQuery,
  context: OperationContext,
  api: InngestRunApi,
  records: Map<string, InngestRunMetadata>,
): Promise<RunPage> {
  const limit = normalizeLimit(query.limit);
  const offset = decodeCursor(query.cursor);
  const candidates = uniqueRecords(records).filter((metadata) => matchesMetadata(query, metadata));
  const all: RunSnapshot[] = [];
  for (const metadata of candidates) {
    const run = await readInngestRun(metadata.runId, context, api, records);
    if (matchesSnapshot(query, run)) all.push(run);
  }
  const items = all.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  const hasMore = nextOffset < all.length;
  return Object.freeze({
    items: Object.freeze(items),
    ...(hasMore ? { nextCursor: encodeCursor(nextOffset) } : {}),
    hasMore,
    availability: Object.freeze(query.runId === undefined
      ? [{ service: context.service, state: "unavailable" as const, reason: "Inngest exposes event-scoped run queries only; historical list scope is unavailable." }]
      : []),
    count: { value: all.length, accuracy: query.runId === undefined ? "approximate" as const : "exact" as const },
  });
}

function queued(metadata: InngestRunMetadata): RunSnapshot {
  return { ...metadata, status: "queued", observedAt: new Date().toISOString(), resultAvailability: "pending" };
}

function unknownMetadata(runId: string, context: OperationContext): InngestRunMetadata {
  return {
    accepted: true,
    runId,
    jobId: "unknown",
    taskId: "unknown",
    taskVersion: "unknown",
    acceptedAt: new Date().toISOString(),
    eventId: runId.replace(/^event:/u, ""),
    buildId: "unknown",
    service: context.service,
    serviceGeneration: context.serviceGeneration,
  };
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") throw new TypeError(`${label} is invalid`);
  return value;
}
