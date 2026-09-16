import type { RunListQuery, RunSnapshot } from "@relkit/contracts/jobs";
import {
  createJobsControls,
  TASK_ITEM_MAX_BYTES,
  validateCanonicalInput,
  validateCanonicalOutput,
  type JobDescriptorAny,
  type JobsRuntime,
} from "@relkit/jobs";
import { optionalCursor, recordInput } from "./common.js";
import { assertSafeRun } from "./projection-validation.js";
import { jobError, scopedRuntime } from "./support.js";

export async function validateCanonicalRun(
  descriptor: JobDescriptorAny,
  run: RunSnapshot,
): Promise<void> {
  try {
    assertSafeRun(run);
    if (run.input !== undefined) {
      await validateCanonicalInput(descriptor.task.input, run.input, descriptor.task.inputWire);
    }
    if (run.progress !== undefined && descriptor.task.progress !== undefined) {
      await validateCanonicalOutput(descriptor.task.progress, run.progress, TASK_ITEM_MAX_BYTES);
    }
    if (run.resultAvailability === "available" && "output" in run) {
      await validateCanonicalOutput(descriptor.task.output, run.output);
    }
  } catch {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job run data is not available.");
  }
}

export async function readRun(
  runtime: JobsRuntime,
  scope: string,
  runId: string,
  signal?: AbortSignal,
): Promise<RunSnapshot> {
  try {
    return await createJobsControls(scopedRuntime(runtime, scope)).get(
      runId,
      signal === undefined ? {} : { signal },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    throw jobError("RELKIT_JOB_RUN_NOT_FOUND", "Job run was not found.");
  }
}

export function queryInput(value: unknown): RunListQuery {
  if (value === undefined) return {};
  const query = recordInput(value);
  const allowed = new Set([
    "status",
    "taskId",
    "taskVersion",
    "buildId",
    "acceptedFrom",
    "acceptedTo",
    "startedFrom",
    "startedTo",
    "completedFrom",
    "completedTo",
    "tags",
    "tagMatch",
    "correlationId",
    "parentRunId",
    "runId",
    "limit",
    "cursor",
  ]);
  if (Object.keys(query).some((key) => !allowed.has(key))) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job list query contains an unsupported field.");
  }
  if (
    query.status !== undefined &&
    (!Array.isArray(query.status) ||
      query.status.length > RUN_STATUSES.size ||
      query.status.some((status) => !RUN_STATUSES.has(status)))
  ) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job list status filter is invalid.");
  }
  for (const key of [
    "taskId",
    "taskVersion",
    "buildId",
    "acceptedFrom",
    "acceptedTo",
    "startedFrom",
    "startedTo",
    "completedFrom",
    "completedTo",
    "correlationId",
    "parentRunId",
    "runId",
  ]) {
    if (query[key as keyof RunListQuery] !== undefined)
      boundedQueryText(query[key as keyof RunListQuery], key);
  }
  if (
    query.tags !== undefined &&
    (!Array.isArray(query.tags) ||
      query.tags.length > 20 ||
      query.tags.some((tag) => boundedQueryText(tag, "tag") === undefined))
  ) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job list tags are invalid.");
  }
  if (query.tagMatch !== undefined && query.tagMatch !== "all" && query.tagMatch !== "any") {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job list tag matching is invalid.");
  }
  const limit = query.limit as unknown;
  if (
    limit !== undefined &&
    (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 100)
  ) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job list limit is invalid.");
  }
  if (query.cursor !== undefined) optionalCursor(query.cursor, "cursor");
  return query as RunListQuery;
}

const RUN_STATUSES = new Set([
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
]);

function boundedQueryText(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > 256
  ) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", `Job list ${name} is invalid.`);
  }
  return value;
}
