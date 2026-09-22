import type { JsonValue } from "@relkit/contracts";
import type {
  JobClientOperation,
  RunPage,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";
import {
  createJobCursor,
  readJobCursor,
  type JobCursorBinding,
  type JobCursorOptions,
} from "@relkit/jobs";
import type { TaskJobNode } from "@relkit/graph";
import { jobError } from "./support.js";
import type { JobsRpcRuntime, TrustedJobScope } from "./types.js";

export function decodeJobCursor(
  config: JobsRpcRuntime,
  trusted: TrustedJobScope,
  job: TaskJobNode,
  operation: JobClientOperation,
  filters: JsonValue,
  cursor: string | undefined,
): string | undefined {
  if (cursor === undefined) return undefined;
  try {
    const value = readJobCursor(
      cursor,
      binding(config, trusted, job, operation, filters),
      cursorOptions(config),
    );
    if (typeof value.position !== "string") throw new Error("Cursor position is not text.");
    return value.position;
  } catch {
    throw jobError("RELKIT_JOB_CURSOR_INVALID", "Job cursor is invalid.");
  }
}

export function encodeJobCursor(
  config: JobsRpcRuntime,
  trusted: TrustedJobScope,
  job: TaskJobNode,
  operation: JobClientOperation,
  filters: JsonValue,
  position: string,
): string {
  try {
    return createJobCursor(
      { ...binding(config, trusted, job, operation, filters), position },
      cursorOptions(config),
    );
  } catch {
    throw jobError("RELKIT_JOB_CURSOR_INVALID", "Job cursor is invalid.");
  }
}

export function projectPageCursor(
  page: RunPage<RunSnapshot>,
  config: JobsRpcRuntime,
  trusted: TrustedJobScope,
  job: TaskJobNode,
  filters: JsonValue,
): RunPage<RunSnapshot> {
  return Object.freeze({
    ...page,
    ...(page.nextCursor === undefined
      ? {}
      : { nextCursor: encodeJobCursor(config, trusted, job, "list", filters, page.nextCursor) }),
  });
}

export function projectWatchCursor(
  frame: RunWatchFrame<RunSnapshot>,
  config: JobsRpcRuntime,
  trusted: TrustedJobScope,
  job: TaskJobNode,
  filters: JsonValue,
): RunWatchFrame<RunSnapshot> {
  if (frame.cursor === undefined) return frame;
  return {
    ...frame,
    cursor: encodeJobCursor(config, trusted, job, "watch", filters, frame.cursor),
  };
}

export function decodeCursorFilters(value: unknown): JsonValue {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw jobError("RELKIT_JOB_CURSOR_INVALID", "Job cursor filters are invalid.");
  }
  return value as JsonValue;
}

function binding(
  config: JobsRpcRuntime,
  trusted: TrustedJobScope,
  job: TaskJobNode,
  operation: JobClientOperation,
  filters: JsonValue,
): JobCursorBinding {
  return {
    application: trusted.application,
    environment: trusted.environment,
    scope: trusted.scope,
    ...(trusted.subject === undefined ? {} : { subject: trusted.subject }),
    jobId: job.jobId,
    operation,
    filters,
    schema: config.publicFingerprint ?? "relkit.jobs.v1",
    position: null,
  };
}

function cursorOptions(config: JobsRpcRuntime): JobCursorOptions | undefined {
  return config.cursorSecret === undefined ? undefined : { key: config.cursorSecret };
}
