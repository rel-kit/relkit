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

/**
 * Accepts only the established native job-run statuses.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A declared native status; unsupported values throw the existing filter error.
 */
export function validStatus(value: string): JobRunStatus {
  if ((STATUSES as readonly string[]).includes(value)) return value as JobRunStatus;
  throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "status is invalid");
}

/**
 * Validates a bounded native jobs page size.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns The accepted page size or existing filter error.
 */
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

/**
 * Normalizes optional query text without creating a default selector.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Trimmed nonempty text or undefined.
 */
export function text(value: string | null): string | undefined {
  return value === null || value.trim() === "" ? undefined : value.trim();
}

/**
 * Validates and normalizes an optional ISO timestamp filter.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param name - Public field or route parameter name.
 * @returns A normalized timestamp or undefined.
 */
export function instant(value: string | null, name: string): string | undefined {
  const result = text(value);
  if (result === undefined) return undefined;
  if (!Number.isFinite(Date.parse(result)))
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, `${name} is invalid`);
  return result;
}

/**
 * Validates a bounded comma-separated run filter.
 * @param params - Native URL query parameters.
 * @param name - Public field or route parameter name.
 * @returns Normalized nonempty selector values; absent filters produce an empty array.
 */
export function csv(params: URLSearchParams, name: string): string[] {
  return params
    .getAll(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Validates an optional selector against the declared native vocabulary.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns An accepted selector or existing filter failure.
 */
export function match(value: string | null): "all" | "any" | undefined {
  const result = text(value);
  if (result === undefined) return undefined;
  if (result === "all" || result === "any") return result;
  throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "tagMatch is invalid");
}

/**
 * Validates a numeric request field against its declared range and default.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param name - Public field or route parameter name.
 * @returns A finite accepted integer or the existing parameter error.
 */
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

/**
 * Removes absent fields before forwarding declared native filters.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Only present filter fields.
 */
export function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) => entry !== undefined && !(Array.isArray(entry) && entry.length === 0),
    ),
  );
}

/**
 * Checks decoded cursor structure before trusting its signature-bound fields.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Whether the decoded value has the established cursor shape.
 */
export function isCursor(value: Record<string, unknown>): boolean {
  return (
    (value.kind === "definitions" || value.kind === "runs" || value.kind === "schedules") &&
    typeof value.generationId === "string" &&
    typeof value.graphHash === "string" &&
    value.filters !== undefined &&
    value.position !== undefined
  );
}

/**
 * Signs canonical cursor metadata with the configured native secret.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param secret - Cursor signing authority; retained only at this boundary.
 * @returns A stable HMAC signature.
 */
export function sign(
  value: InspectorCursor | Record<string, unknown>,
  secret: string | Uint8Array,
): string {
  return createHmac("sha256", secret).update(canonicalJson(value), "utf8").digest("base64url");
}

/**
 * Compares cursor signatures using the existing constant-time byte check.
 * @param left - First projected value in the stable ordering.
 * @param right - Second projected value in the stable ordering.
 * @returns Whether the signatures have equal length and bytes.
 */
export function equal(left: string, right: string): boolean {
  const a = Buffer.from(left, "base64url");
  const b = Buffer.from(right, "base64url");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Checks the existing non-null non-array record boundary.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Whether the value can be selectively projected as a record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Projects filters for the public jobs query envelope.
 * @param filters - Validated filters bound into the continuation cursor.
 * @returns Present declared run filter fields.
 */
export function queryFiltersValue(filters: InspectorRunFilters): JsonValue {
  const { limit: _limit, jobName: _jobName, cursor: _cursor, ...value } = filters;
  return value as JsonValue;
}
