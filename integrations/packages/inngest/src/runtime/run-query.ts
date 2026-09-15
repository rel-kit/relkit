import type { RunListQuery, RunSnapshot } from "@relkit/contracts/jobs";
import type { InngestRunMetadata } from "./runs.js";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

export function matchesMetadata(query: RunListQuery, metadata: InngestRunMetadata): boolean {
  return (query.runId === undefined || query.runId === metadata.runId || query.runId === metadata.eventId || query.runId === `event:${metadata.eventId}`) &&
    (query.jobId === undefined || query.jobId === metadata.jobId) &&
    (query.taskId === undefined || query.taskId === metadata.taskId) &&
    (query.taskVersion === undefined || query.taskVersion === metadata.taskVersion) &&
    (query.buildId === undefined || query.buildId === metadata.buildId) &&
    (query.service === undefined || query.service === metadata.service) &&
    (query.correlationId === undefined || query.correlationId === metadata.correlationId) &&
    (query.parentRunId === undefined || query.parentRunId === metadata.parentRunId) &&
    inRange(metadata.acceptedAt, query.acceptedFrom, query.acceptedTo) &&
    tagsMatch(query.tags, query.tagMatch, metadata.tags);
}

export function matchesSnapshot(query: RunListQuery, run: RunSnapshot): boolean {
  return (query.status === undefined || query.status.includes(run.status)) &&
    inRange(run.startedAt, query.startedFrom, query.startedTo) &&
    inRange(run.completedAt, query.completedFrom, query.completedTo);
}

export function uniqueRecords(records: Map<string, InngestRunMetadata>): InngestRunMetadata[] {
  return [...new Map([...records.values()].map((metadata) => [metadata.runId, metadata])).values()];
}

export function normalizeLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new TypeError("Inngest run list limit is invalid");
  return limit;
}

export function decodeCursor(value: string | undefined): number {
  if (value === undefined) return 0;
  const decoded = Buffer.from(value, "base64url").toString("utf8");
  if (!/^\d+$/u.test(decoded)) throw new TypeError("Inngest run list cursor is invalid");
  const offset = Number(decoded);
  if (!Number.isSafeInteger(offset)) throw new TypeError("Inngest run list cursor is invalid");
  return offset;
}

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString("base64url");
}

function tagsMatch(
  requested: readonly string[] | undefined,
  mode: "all" | "any" | undefined,
  actual: readonly string[] | undefined,
): boolean {
  if (requested === undefined || requested.length === 0) return true;
  const values = new Set(actual ?? []);
  return (mode ?? "all") === "all"
    ? requested.every((tag) => values.has(tag))
    : requested.some((tag) => values.has(tag));
}

function inRange(value: string | undefined, from: string | undefined, to: string | undefined): boolean {
  if (from === undefined && to === undefined) return true;
  if (value === undefined) return false;
  const timestamp = Date.parse(value);
  const lower = from === undefined ? undefined : Date.parse(from);
  const upper = to === undefined ? undefined : Date.parse(to);
  return Number.isFinite(timestamp) && (lower === undefined || timestamp >= lower) && (upper === undefined || timestamp <= upper);
}
