import type { RunAvailability, RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import { jobError } from "./support.js";

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

const RESULT_AVAILABILITY = new Set([
  "pending",
  "available",
  "void",
  "redacted",
  "expired",
  "not-selected",
  "version-incompatible",
  "unavailable",
]);

export function assertSafeRun(value: unknown): asserts value is RunSnapshot {
  if (!isRecord(value) || value.accepted !== true) invalidRun();
  for (const key of [
    "runId",
    "jobId",
    "taskId",
    "taskVersion",
    "acceptedAt",
    "buildId",
    "service",
    "observedAt",
  ]) {
    boundedText(value[key], key);
  }
  if (typeof value.status !== "string" || !RUN_STATUSES.has(value.status)) invalidRun();
  if (
    typeof value.resultAvailability !== "string" ||
    !RESULT_AVAILABILITY.has(value.resultAvailability)
  )
    invalidRun();
  if (value.scope !== undefined) boundedText(value.scope, "scope");
  for (const key of [
    "inputHash",
    "inputSchemaHash",
    "acceptanceIdentity",
    "parentRunId",
    "retryOfRunId",
    "scheduledFor",
    "startedAt",
    "completedAt",
    "nextEligibleAt",
  ]) {
    if (value[key] !== undefined) boundedText(value[key], key);
  }
  if (
    value.attempt !== undefined &&
    (typeof value.attempt !== "number" || !Number.isSafeInteger(value.attempt) || value.attempt < 0)
  )
    invalidRun();
  if (
    value.status === "completed" &&
    value.resultAvailability === "available" &&
    !hasOwn(value, "output")
  )
    invalidRun();
  if (value.status !== "completed" && hasOwn(value, "output")) invalidRun();
  if (value.cancellation !== undefined) assertCancellation(value.cancellation);
}

export function safeAvailability(value: readonly unknown[]): readonly RunAvailability[] {
  return value.map((entry) => {
    if (!isRecord(entry)) invalidPage();
    boundedText(entry.service, "availability service");
    if (entry.state !== "available" && entry.state !== "unavailable") invalidPage();
    if (entry.reason !== undefined) boundedText(entry.reason, "availability reason");
    return Object.freeze({
      service: entry.service,
      state: entry.state,
      ...(entry.reason === undefined ? {} : { reason: entry.reason }),
    });
  });
}

export function assertSafeWatchFrame(value: unknown): asserts value is RunWatchFrame<RunSnapshot> {
  if (!isRecord(value) || !isWatchKind(value.kind)) invalidFrame();
  assertSafeRun(value.run);
  boundedText(value.observedAt, "observation timestamp");
  boundedText(value.epoch, "observation epoch");
  if (
    typeof value.sequence !== "number" ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 0
  )
    invalidFrame();
  if (value.cursor !== undefined) boundedText(value.cursor, "cursor", 4096);
  if (value.kind === "snapshot" && value.continuity !== "state" && value.continuity !== "history")
    invalidFrame();
  if (
    value.kind === "reset" &&
    !["reconnected", "cursor-expired", "history-unavailable", "overflow"].includes(
      String(value.reason),
    )
  )
    invalidFrame();
}

function assertCancellation(value: unknown): void {
  if (!isRecord(value)) invalidRun();
  boundedText(value.runId, "cancellation run ID");
  boundedText(value.operationId, "cancellation operation ID");
  if (
    value.outcome !== "requested" &&
    value.outcome !== "already-terminal" &&
    value.outcome !== "unsupported"
  )
    invalidRun();
  if (value.requestedAt !== undefined) boundedText(value.requestedAt, "cancellation timestamp");
}

function boundedText(value: unknown, name: string, maxBytes = 256): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > maxBytes
  ) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", `Job ${name} is not available.`);
  }
}

function invalidRun(): never {
  throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job run data is not available.");
}

function invalidPage(): never {
  throw jobError("RELKIT_JOB_RUN_NOT_FOUND", "Job run page is unavailable.");
}

function invalidFrame(): never {
  throw jobError("RELKIT_JOB_RUN_NOT_FOUND", "Job observation frame is invalid.");
}

function isWatchKind(value: unknown): value is RunWatchFrame["kind"] {
  return value === "snapshot" || value === "update" || value === "reset";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
