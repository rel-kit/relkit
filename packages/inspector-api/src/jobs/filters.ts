import { canonicalJson, type JsonValue } from "@relkit/contracts";
import type { RunListQuery } from "@relkit/contracts/jobs";
import { InspectorJobsError, type InspectorJobsBinding } from "./types.js";
import {
  ACTIVE,
  compact,
  csv,
  equal,
  instant,
  integer,
  isCursor,
  isRecord,
  match,
  queryFiltersValue,
  readLimit,
  sign,
  text,
  validStatus,
} from "./filters-support.js";

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
    throw new InspectorJobsError(
      "RELKIT_INSPECTOR_JOBS_FILTER_UNSUPPORTED",
      400,
      "scope filter is unavailable",
    );
  const statuses = csv(params, "status");
  const status =
    statuses.length === 0
      ? undefined
      : statuses.includes("active")
        ? ACTIVE
        : statuses.map((value) => validStatus(value));
  const acceptedFrom = instant(params.get("acceptedFrom") ?? params.get("from"), "acceptedFrom");
  const acceptedTo = instant(params.get("acceptedTo") ?? params.get("to"), "acceptedTo");
  if (
    acceptedFrom !== undefined &&
    acceptedTo !== undefined &&
    Date.parse(acceptedFrom) >= Date.parse(acceptedTo)
  )
    throw new InspectorJobsError(
      "RELKIT_INSPECTOR_JOBS_FILTER_INVALID",
      400,
      "accepted time range is invalid",
    );
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
  return queryFiltersValue(filters);
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
    ["status", "status"],
    ["jobId", "job"],
    ["taskId", "task"],
    ["service", "service"],
    ["acceptedFrom", "accepted-time"],
    ["acceptedTo", "accepted-time"],
    ["runId", "run-id"],
    ["taskVersion", "task-version"],
    ["buildId", "build"],
    ["tags", "tags"],
    ["tagMatch", "tag-match"],
    ["nativeQuery", "native-query"],
    ["failure", "failure"],
    ["attempt", "attempt"],
    ["timezone", "timezone"],
  ];
  for (const [field, capability] of checks)
    if (filters[field] !== undefined && !supported.includes(capability))
      throw new InspectorJobsError(
        "RELKIT_INSPECTOR_JOBS_FILTER_UNSUPPORTED",
        400,
        `${capability} filter is unavailable for ${binding.service}`,
      );
}

export function encodeCursor(cursor: InspectorCursor, secret: string | Uint8Array): string {
  const body = { ...cursor, mac: sign(cursor, secret) };
  const encoded = Buffer.from(canonicalJson(body), "utf8").toString("base64url");
  if (new TextEncoder().encode(encoded).byteLength > 4096)
    throw new InspectorJobsError(
      "RELKIT_INSPECTOR_JOBS_CURSOR_INVALID",
      400,
      "cursor is too large",
    );
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
  if (
    unsigned.kind !== expected.kind ||
    unsigned.generationId !== expected.generationId ||
    unsigned.graphHash !== expected.graphHash ||
    canonicalJson(unsigned.filters) !== canonicalJson(expected.filters)
  )
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  return unsigned as unknown as InspectorCursor;
}

export function cursorSecret(
  secret: string | Uint8Array | undefined,
  graphHash: string,
): string | Uint8Array {
  return secret ?? graphHash;
}
