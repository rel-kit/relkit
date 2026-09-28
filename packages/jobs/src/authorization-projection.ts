import { canonicalJson, isJsonValue, type JsonValue } from "@relkit/contracts";
import type { RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import { Effect } from "effect";
import type { JobClientField } from "./job.types.js";
import { observeJobs } from "./jobs-observability.js";
import type { JobProjectionOptions } from "./authorization-projection.types.js";
export type { JobProjectionOptions } from "./authorization-projection.types.js";
/** Copies only authorized run fields into a safe client snapshot.
 * @param run - Provider snapshot to project.
 * @param fields - Fields granted to the caller.
 * @param options - Declared error identifiers eligible for disclosure.
 * @returns A projected snapshot; this pure operation has no expected failure.
 * @example Effect.runSync(projectRunSnapshotEffect(run, ["output"]));
 */
export const projectRunSnapshotEffect = Effect.fn("Jobs.projectRunSnapshot")(
  (run: RunSnapshot, fields: readonly JobClientField[] = [], options: JobProjectionOptions = {}) =>
    observeJobs(
      "authorization.projectSnapshot",
      Effect.sync(() => projectSnapshot(run, fields, options)),
    ),
);
/** Synchronous compatibility projection of one run.
 * @param run - Provider snapshot.
 * @param fields - Authorized fields.
 * @param options - Declared error identifiers.
 * @returns The safe projected snapshot.
 * @example projectRunSnapshot(run, ["output"]);
 */
export function projectRunSnapshot(
  run: RunSnapshot,
  fields: readonly JobClientField[] = [],
  options: JobProjectionOptions = {},
): RunSnapshot {
  return Effect.runSync(projectRunSnapshotEffect(run, fields, options));
}
function projectSnapshot(
  run: RunSnapshot,
  fields: readonly JobClientField[],
  options: JobProjectionOptions,
): RunSnapshot {
  const selected = new Set(fields);
  const declaredErrorIds = new Set(options.declaredErrorIds);
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
  if (selected.has("progress") && run.progress !== undefined)
    copyField(base, "progress", run.progress);
  if (selected.has("output") && run.resultAvailability === "available" && "output" in run) {
    copyField(base, "output", run.output);
  }
  if (selected.has("error") && run.error !== undefined) {
    base.error = safeError(run.error, declaredErrorIds);
  }
  for (const field of [
    "attempt",
    "startedAt",
    "completedAt",
    "nextEligibleAt",
    "parentRunId",
    "retryOfRunId",
    "scheduledFor",
  ] as const) {
    if (run[field] !== undefined) base[field] = run[field];
  }
  if (run.cancellation !== undefined) base.cancellation = safeCancellation(run.cancellation);
  return Object.freeze(base) as unknown as RunSnapshot;
}
/** Projects a page of runs without exposing fields outside the grant.
 * @param page - Provider page.
 * @param fields - Authorized fields.
 * @param options - Declared error identifiers.
 * @returns A projected page; this pure operation has no expected failure.
 * @example Effect.runSync(projectRunPageEffect(page, ["progress"]));
 */
export const projectRunPageEffect = Effect.fn("Jobs.projectRunPage")(
  (
    page: RunPage<RunSnapshot>,
    fields: readonly JobClientField[] = [],
    options: JobProjectionOptions = {},
  ) =>
    observeJobs(
      "authorization.projectPage",
      Effect.sync(() => projectPage(page, fields, options)),
    ),
);
/** Synchronous compatibility projection of a page.
 * @param page - Provider page.
 * @param fields - Authorized fields.
 * @param options - Declared error identifiers.
 * @returns A safe projected page.
 * @example projectRunPage(page, ["progress"]);
 */
export function projectRunPage(
  page: RunPage<RunSnapshot>,
  fields: readonly JobClientField[] = [],
  options: JobProjectionOptions = {},
): RunPage<RunSnapshot> {
  return Effect.runSync(projectRunPageEffect(page, fields, options));
}
function projectPage(
  page: RunPage<RunSnapshot>,
  fields: readonly JobClientField[],
  options: JobProjectionOptions,
): RunPage<RunSnapshot> {
  return Object.freeze({
    items: Object.freeze(page.items.map((run) => projectSnapshot(run, fields, options))),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    hasMore: page.hasMore,
    availability: Object.freeze(page.availability.map((entry) => Object.freeze({ ...entry }))),
    ...(page.count === undefined ? {} : { count: Object.freeze({ ...page.count }) }),
  });
}
function safeError(value: unknown, declaredErrorIds: ReadonlySet<string>): JsonValue {
  if (value === null || typeof value !== "object") return genericError();
  const candidate = value as {
    readonly code?: unknown;
    readonly message?: unknown;
    readonly details?: unknown;
    readonly data?: unknown;
    readonly retry?: unknown;
    readonly afterMs?: unknown;
  };
  const code = safeText(candidate.code, "");
  const declared = code !== "" && declaredErrorIds.has(code);
  return {
    code: declared ? code : "RELKIT_JOB_FAILURE",
    message: declared ? safeText(candidate.message, "Job failed") : "Job failed",
    ...(declared ? safeDetails(candidate.details ?? candidate.data) : {}),
    ...(candidate.retry === "never" || candidate.retry === "later"
      ? { retry: candidate.retry }
      : {}),
    ...(typeof candidate.afterMs === "number" &&
    Number.isSafeInteger(candidate.afterMs) &&
    candidate.afterMs >= 0
      ? { afterMs: candidate.afterMs }
      : {}),
  };
}
function genericError(): JsonValue {
  return { code: "RELKIT_JOB_FAILURE", message: "Job failed" };
}
function safeText(value: unknown, fallback: string): string {
  return typeof value === "string" && new TextEncoder().encode(value).byteLength <= 256
    ? value
    : fallback;
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
function safeDetails(value: unknown): { readonly details?: JsonValue } {
  const details = safeJson(value);
  if (details === undefined) return {};
  try {
    if (new TextEncoder().encode(canonicalJson(details)).byteLength > 64 * 1024) return {};
  } catch {
    return {};
  }
  return { details };
}
function safeCancellation(value: NonNullable<RunSnapshot["cancellation"]>): JsonValue {
  return {
    runId: value.runId,
    operationId: value.operationId,
    outcome: value.outcome,
    ...(value.requestedAt === undefined ? {} : { requestedAt: value.requestedAt }),
  };
}
