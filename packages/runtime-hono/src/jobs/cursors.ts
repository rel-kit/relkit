import type { JsonValue } from "@relkit/contracts";
import type {
  JobClientOperation,
  RunPage,
  RunSnapshot,
  RunWatchFrame,
} from "@relkit/contracts/jobs";
import type { TaskJobNode } from "@relkit/graph";
import {
  createJobCursor,
  readJobCursor,
  type JobCursorBinding,
  type JobCursorOptions,
} from "@relkit/jobs";
import { jobError } from "./support.js";
import type { JobsRpcRuntime, TrustedJobScope } from "./types.js";

/** Verify a public cursor against its job, identity, operation and filters.
 * @param config - Configured jobs runtime and cursor policy.
 * @param trusted - Trusted application, environment and subject scope.
 * @param job - Compiled task job registration.
 * @param operation - Public job client operation.
 * @param filters - Filters bound into cursor identity.
 * @param cursor - Opaque public cursor, when supplied.
 * @returns The provider cursor position or undefined when absent.
 */
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

/** Bind a provider cursor to the current public job request.
 * @param config - Configured jobs runtime and cursor policy.
 * @param trusted - Trusted application, environment and subject scope.
 * @param job - Compiled task job registration.
 * @param operation - Public job client operation.
 * @param filters - Filters bound into cursor identity.
 * @param position - Provider continuation position to wrap.
 * @returns An opaque public cursor carrying the supplied position.
 */
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

/** Replace a list page's provider cursor with its public bound cursor.
 * @param page - Provider page to validate or project.
 * @param config - Configured jobs runtime and cursor policy.
 * @param trusted - Trusted application, environment and subject scope.
 * @param job - Compiled task job registration.
 * @param filters - Filters bound into cursor identity.
 * @returns A frozen page retaining items and any wrapped continuation.
 */
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

/** Replace a watch frame's provider cursor with its public bound cursor.
 * @param frame - Native frame to validate or encode.
 * @param config - Configured jobs runtime and cursor policy.
 * @param trusted - Trusted application, environment and subject scope.
 * @param job - Compiled task job registration.
 * @param filters - Filters bound into cursor identity.
 * @returns The frame with a wrapped cursor, or the original cursorless frame.
 */
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

/** Require an object filter set for public cursor binding.
 * @param value - Value to validate or project.
 * @returns The filter object, defaulting to an empty object.
 */
export function decodeCursorFilters(value: unknown): JsonValue {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw jobError("RELKIT_JOB_CURSOR_INVALID", "Job cursor filters are invalid.");
  }
  return value as JsonValue;
}

/** Construct the identity and schema partition a job cursor must match.
 * @param config - Configured jobs runtime and cursor policy.
 * @param trusted - Trusted application, environment and subject scope.
 * @param job - Compiled task job registration.
 * @param operation - Public job client operation.
 * @param filters - Filters bound into cursor identity.
 * @returns The cursor binding with a placeholder position.
 */
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

/** Select the configured signing key for job cursor encoding.
 * @param config - Configured jobs runtime and cursor policy.
 * @returns Signing options, or undefined for the default cursor codec.
 */
function cursorOptions(config: JobsRpcRuntime): JobCursorOptions | undefined {
  return config.cursorSecret === undefined ? undefined : { key: config.cursorSecret };
}
