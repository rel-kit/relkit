import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson, type JsonValue } from "@relkit/contracts";
import type { JobRunStatus } from "@relkit/contracts/jobs";
import { InspectorJobsError } from "./types.js";
import type { InspectorCursor, InspectorRunFilters } from "./filters.js";

export const STATUSES: readonly JobRunStatus[] = [
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
export const ACTIVE = STATUSES.filter(
  (status) => !["completed", "failed", "cancelled", "timed-out"].includes(status),
);

export function validStatus(value: string): JobRunStatus {
  if ((STATUSES as readonly string[]).includes(value)) return value as JobRunStatus;
  throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "status is invalid");
}
export function readLimit(value: string | null): number {
  if (value === null || value === "") return 25;
  if (!/^\d+$/.test(value))
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "limit is invalid");
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new InspectorJobsError(
      "RELKIT_INSPECTOR_JOBS_FILTER_INVALID",
      400,
      "limit must be between 1 and 100",
    );
  return limit;
}
export function text(value: string | null): string | undefined {
  return value === null || value.trim() === "" ? undefined : value.trim();
}
export function instant(value: string | null, name: string): string | undefined {
  const result = text(value);
  if (result === undefined) return undefined;
  if (!Number.isFinite(Date.parse(result)))
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, `${name} is invalid`);
  return result;
}
export function csv(params: URLSearchParams, name: string): string[] {
  return params
    .getAll(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}
export function match(value: string | null): "all" | "any" | undefined {
  const result = text(value);
  if (result === undefined) return undefined;
  if (result === "all" || result === "any") return result;
  throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "tagMatch is invalid");
}
export function integer(value: string | null, name: string): number | undefined {
  const result = text(value);
  if (result === undefined) return undefined;
  if (!/^\d+$/u.test(result))
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, `${name} is invalid`);
  const parsed = Number(result);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, `${name} is invalid`);
  return parsed;
}
export function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) => entry !== undefined && !(Array.isArray(entry) && entry.length === 0),
    ),
  );
}
export function isCursor(value: Record<string, unknown>): boolean {
  return (
    (value.kind === "definitions" || value.kind === "runs" || value.kind === "schedules") &&
    typeof value.generationId === "string" &&
    typeof value.graphHash === "string" &&
    value.filters !== undefined &&
    value.position !== undefined
  );
}
export function sign(
  value: InspectorCursor | Record<string, unknown>,
  secret: string | Uint8Array,
): string {
  return createHmac("sha256", secret).update(canonicalJson(value), "utf8").digest("base64url");
}
export function equal(left: string, right: string): boolean {
  const a = Buffer.from(left, "base64url");
  const b = Buffer.from(right, "base64url");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function queryFiltersValue(filters: InspectorRunFilters): JsonValue {
  const { limit: _limit, jobName: _jobName, cursor: _cursor, ...value } = filters;
  return value as JsonValue;
}
