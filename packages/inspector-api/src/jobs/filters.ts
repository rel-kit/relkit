import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson, type JsonValue } from "@relkit/contracts";
import type { JobRunStatus, RunListQuery } from "@relkit/contracts/jobs";
import { InspectorJobsError, type InspectorJobsBinding } from "./types.js";

const STATUSES: readonly JobRunStatus[] = [
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
];
const ACTIVE = STATUSES.filter((status) => !["completed", "failed", "cancelled", "timed-out"].includes(status));

export interface InspectorRunFilters extends RunListQuery {
  readonly jobName?: string;
  readonly failure?: string;
  readonly attempt?: number;
  readonly timezone?: string;
  readonly nativeQuery?: string;
}

export interface InspectorCursor {
  readonly kind: "definitions" | "runs" | "schedules";
  readonly generationId: string;
  readonly graphHash: string;
  readonly filters: JsonValue;
  readonly position: JsonValue;
}

export function parseRunFilters(request: Request): InspectorRunFilters {
  const params = new URL(request.url).searchParams;
  if (params.has("scope"))
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_UNSUPPORTED", 400, "scope filter is unavailable");
  const statuses = csv(params, "status");
  const status = statuses.length === 0
    ? undefined
    : statuses.includes("active")
      ? ACTIVE
      : statuses.map((value) => validStatus(value));
  const acceptedFrom = instant(params.get("acceptedFrom") ?? params.get("from"), "acceptedFrom");
  const acceptedTo = instant(params.get("acceptedTo") ?? params.get("to"), "acceptedTo");
  if (acceptedFrom !== undefined && acceptedTo !== undefined && Date.parse(acceptedFrom) >= Date.parse(acceptedTo))
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "accepted time range is invalid");
  return compact({
    status,
    jobId: text(params.get("jobId")),
    jobName: text(params.get("job") ?? params.get("name")),
    taskId: text(params.get("taskId") ?? params.get("task")),
    taskVersion: text(params.get("taskVersion")),
    buildId: text(params.get("buildId")),
    service: text(params.get("service")),
    acceptedFrom,
    acceptedTo,
    startedFrom: instant(params.get("startedFrom"), "startedFrom"),
    startedTo: instant(params.get("startedTo"), "startedTo"),
    completedFrom: instant(params.get("completedFrom"), "completedFrom"),
    completedTo: instant(params.get("completedTo"), "completedTo"),
    tags: csv(params, "tag").concat(csv(params, "tags")),
    tagMatch: match(params.get("tagMatch")),
    correlationId: text(params.get("correlationId")),
    parentRunId: text(params.get("parentRunId")),
    runId: text(params.get("runId")),
    failure: text(params.get("failure")),
    attempt: integer(params.get("attempt"), "attempt"),
    timezone: text(params.get("timezone")),
    nativeQuery: text(params.get("nativeQuery")),
    limit: readLimit(params.get("limit")),
  }) as InspectorRunFilters;
}

export function queryFilters(filters: InspectorRunFilters): JsonValue {
  const { limit: _limit, jobName: _jobName, cursor: _cursor, ...value } = filters;
  return value as JsonValue;
}

export function nativeRunFilters(filters: InspectorRunFilters): RunListQuery {
  return queryFilters(filters) as RunListQuery;
}

export function assertFilterSupport(
  binding: InspectorJobsBinding,
  filters: InspectorRunFilters,
): void {
  const supported = binding.capabilities?.filters;
  if (supported === undefined) return;
  const checks: readonly [keyof InspectorRunFilters, string][] = [
    ["status", "status"], ["jobId", "job"], ["taskId", "task"], ["service", "service"],
    ["acceptedFrom", "accepted-time"], ["acceptedTo", "accepted-time"], ["runId", "run-id"],
    ["taskVersion", "task-version"], ["buildId", "build"], ["tags", "tags"],
    ["tagMatch", "tag-match"], ["nativeQuery", "native-query"],
    ["failure", "failure"], ["attempt", "attempt"], ["timezone", "timezone"],
  ];
  for (const [field, capability] of checks)
    if (filters[field] !== undefined && !supported.includes(capability))
      throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_UNSUPPORTED", 400, `${capability} filter is unavailable for ${binding.service}`);
}

export function encodeCursor(cursor: InspectorCursor, secret: string | Uint8Array): string {
  const body = { ...cursor, mac: sign(cursor, secret) };
  const encoded = Buffer.from(canonicalJson(body), "utf8").toString("base64url");
  if (new TextEncoder().encode(encoded).byteLength > 4096)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400, "cursor is too large");
  return encoded;
}

export function decodeCursor(
  value: string,
  expected: Omit<InspectorCursor, "position">,
  secret: string | Uint8Array,
): InspectorCursor {
  if (value.length === 0 || new TextEncoder().encode(value).byteLength > 4096)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  }
  if (Buffer.from(value, "base64url").toString("base64url") !== value)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  if (!isRecord(parsed) || typeof parsed.mac !== "string" || !isCursor(parsed))
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  const { mac, ...unsigned } = parsed;
  if (!equal(mac, sign(unsigned as unknown as InspectorCursor, secret)))
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  if (unsigned.kind !== expected.kind || unsigned.generationId !== expected.generationId || unsigned.graphHash !== expected.graphHash || canonicalJson(unsigned.filters) !== canonicalJson(expected.filters))
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  return unsigned as unknown as InspectorCursor;
}

export function cursorSecret(secret: string | Uint8Array | undefined, graphHash: string): string | Uint8Array {
  return secret ?? graphHash;
}

function validStatus(value: string): JobRunStatus {
  if ((STATUSES as readonly string[]).includes(value)) return value as JobRunStatus;
  throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "status is invalid");
}
function readLimit(value: string | null): number {
  if (value === null || value === "") return 25;
  if (!/^\d+$/.test(value)) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "limit is invalid");
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "limit must be between 1 and 100");
  return limit;
}
function text(value: string | null): string | undefined {
  return value === null || value.trim() === "" ? undefined : value.trim();
}
function instant(value: string | null, name: string): string | undefined {
  const result = text(value);
  if (result === undefined) return undefined;
  if (!Number.isFinite(Date.parse(result))) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, `${name} is invalid`);
  return result;
}
function csv(params: URLSearchParams, name: string): string[] {
  return params.getAll(name).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
}
function match(value: string | null): "all" | "any" | undefined {
  const result = text(value);
  if (result === undefined) return undefined;
  if (result === "all" || result === "any") return result;
  throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "tagMatch is invalid");
}
function integer(value: string | null, name: string): number | undefined {
  const result = text(value);
  if (result === undefined) return undefined;
  if (!/^\d+$/u.test(result)) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, `${name} is invalid`);
  const parsed = Number(result);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, `${name} is invalid`);
  return parsed;
}
function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && !(Array.isArray(entry) && entry.length === 0)));
}
function isCursor(value: Record<string, unknown>): boolean {
  return (value.kind === "definitions" || value.kind === "runs" || value.kind === "schedules") && typeof value.generationId === "string" && typeof value.graphHash === "string" && value.filters !== undefined && value.position !== undefined;
}
function sign(value: InspectorCursor | Record<string, unknown>, secret: string | Uint8Array): string {
  return createHmac("sha256", secret).update(canonicalJson(value), "utf8").digest("base64url");
}
function equal(left: string, right: string): boolean {
  const a = Buffer.from(left, "base64url");
  const b = Buffer.from(right, "base64url");
  return a.length === b.length && timingSafeEqual(a, b);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
