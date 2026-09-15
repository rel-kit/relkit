import { canonicalJson, isJsonValue, type JsonValue } from "@relkit/contracts";
import type { RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import type { JobClientField } from "./job-types.js";

export function projectRunSnapshot(
  run: RunSnapshot,
  fields: readonly JobClientField[] = [],
): RunSnapshot {
  const selected = new Set(fields);
  const base: Record<string, unknown> = {
    accepted: true,
    runId: run.runId,
    jobId: run.jobId,
    taskId: run.taskId,
    taskVersion: run.taskVersion,
    acceptedAt: run.acceptedAt,
    buildId: run.buildId,
    service: run.service,
    status: run.status,
    observedAt: run.observedAt,
    resultAvailability: run.resultAvailability,
  };
  if (selected.has("input") && run.input !== undefined) copyField(base, "input", run.input);
  if (selected.has("progress") && run.progress !== undefined) copyField(base, "progress", run.progress);
  if (selected.has("output") && run.resultAvailability === "available" && "output" in run) {
    copyField(base, "output", run.output);
  }
  if (selected.has("error") && run.error !== undefined) base.error = safeError(run.error);
  for (const field of ["attempt", "startedAt", "completedAt", "nextEligibleAt", "parentRunId", "retryOfRunId", "scheduledFor"] as const) {
    if (run[field] !== undefined) base[field] = run[field];
  }
  if (run.cancellation !== undefined) base.cancellation = safeCancellation(run.cancellation);
  return Object.freeze(base) as unknown as RunSnapshot;
}

export function projectRunPage(
  page: RunPage<RunSnapshot>,
  fields: readonly JobClientField[] = [],
): RunPage<RunSnapshot> {
  return Object.freeze({
    items: Object.freeze(page.items.map((run) => projectRunSnapshot(run, fields))),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    hasMore: page.hasMore,
    availability: Object.freeze(page.availability.map((entry) => Object.freeze({ ...entry }))),
    ...(page.count === undefined ? {} : { count: Object.freeze({ ...page.count }) }),
  });
}

function safeError(value: unknown): JsonValue {
  if (value === null || typeof value !== "object") return { code: "RELKIT_JOB_FAILURE", message: "Job failed" };
  const candidate = value as { readonly code?: unknown; readonly message?: unknown; readonly retry?: unknown; readonly afterMs?: unknown };
  return {
    code: safeText(candidate.code, "RELKIT_JOB_FAILURE"),
    message: safeText(candidate.message, "Job failed"),
    ...(candidate.retry === "never" || candidate.retry === "later" ? { retry: candidate.retry } : {}),
    ...(typeof candidate.afterMs === "number" && Number.isSafeInteger(candidate.afterMs) && candidate.afterMs >= 0
      ? { afterMs: candidate.afterMs }
      : {}),
  };
}

function safeText(value: unknown, fallback: string): string {
  return typeof value === "string" && new TextEncoder().encode(value).byteLength <= 256 ? value : fallback;
}

function copyField(target: Record<string, unknown>, name: string, value: unknown): void {
  const safe = safeJson(value);
  if (safe !== undefined) target[name] = safe;
}

function safeJson(value: unknown): JsonValue | undefined {
  if (!isJsonValue(value)) return undefined;
  try {
    return JSON.parse(canonicalJson(value)) as JsonValue;
  } catch {
    return undefined;
  }
}

function safeCancellation(value: NonNullable<RunSnapshot["cancellation"]>): JsonValue {
  return {
    runId: value.runId,
    operationId: value.operationId,
    outcome: value.outcome,
    ...(value.requestedAt === undefined ? {} : { requestedAt: value.requestedAt }),
  };
}
