import { normalizeId } from "@relkit/contracts";
import { JobAdminError } from "./admin-errors.js";
import {
  JOB_ADMIN_PROTOCOL,
  JOB_ADMIN_VERSION,
  type JobAdminMode,
  type JobQueryRequest,
} from "./admin-contracts.js";
import type { JobQueueEntry } from "./queue-utils.js";

/** Validates the requested page size and caps it at the inspection bound.
 * @param value - Value to validate, normalize or project.
 * @returns The validated page size capped at the inspection maximum.
 */
export function pageLimit(value: number | undefined): number {
  if (value === undefined) return 50;
  if (!Number.isSafeInteger(value) || value < 1)
    throw newAdminError("RELKIT_JOB_ADMIN_QUERY_INVALID", "Job query limit is invalid");
  return Math.min(value, 100);
}

/** Rejects unsupported state filters before producing inspection results.
 * @param request - Caller domain request.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
export function validateQuery(request: JobQueryRequest): void {
  if (request.state !== undefined && !isState(request.state))
    throw newAdminError("RELKIT_JOB_ADMIN_QUERY_INVALID", "Job query state is invalid");
  if (
    request.states !== undefined &&
    (!Array.isArray(request.states) || request.states.some((state) => !isState(state)))
  )
    throw newAdminError("RELKIT_JOB_ADMIN_QUERY_INVALID", "Job query states are invalid");
}

/** Rejects malformed requests and unsupported administration protocol versions.
 * @param value - Value to validate, normalize or project.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
export function assertVersion(value: unknown): void {
  if (!isRecord(value))
    throw newAdminError("RELKIT_JOB_ADMIN_REQUEST_INVALID", "Job admin request is invalid");
  if (
    (value.protocol !== undefined && value.protocol !== JOB_ADMIN_PROTOCOL) ||
    (value.version !== undefined && value.version !== JOB_ADMIN_VERSION)
  )
    throw newAdminError("RELKIT_JOB_ADMIN_PROTOCOL_MISMATCH", "Unsupported job admin protocol");
}

/** Restricts administration mode to development, test or production.
 * @param value - Value to validate, normalize or project.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
export function assertMode(value: string): asserts value is JobAdminMode {
  if (value !== "development" && value !== "test" && value !== "production")
    throw newAdminError("RELKIT_JOB_ADMIN_MODE_INVALID", "Job admin mode is invalid");
}

/** Normalizes an identifier, returning undefined when validation fails.
 * @param value - Value to validate, normalize or project.
 * @returns The normalized identifier, or undefined when it is invalid.
 */
export function safeId(value: unknown): string | undefined {
  try {
    return normalizeId(value);
  } catch {
    return undefined;
  }
}

/** Validates and truncates an optional audit reason to its bounded public length.
 * @param value - Value to validate, normalize or project.
 * @returns The bounded reason, or undefined when absent.
 */
export function readReason(value: unknown): string | undefined {
  if (!isRecord(value) || value.reason === undefined) return undefined;
  if (typeof value.reason !== "string" || value.reason.trim() === "")
    throw newAdminError("RELKIT_JOB_ADMIN_REQUEST_INVALID", "Job action reason is invalid");
  return value.reason.trim().slice(0, 256);
}

/** Extracts a valid reason without replacing the original rejected-action error.
 * @param value - Value to validate, normalize or project.
 * @returns The bounded reason, or undefined when absent or invalid.
 */
export function safeReason(value: unknown): string | undefined {
  try {
    return readReason(value);
  } catch {
    return undefined;
  }
}

/** Preserves known admin errors and maps unexpected failures to the public action-failed code.
 * @param value - Value to validate, normalize or project.
 * @returns The public admin error preserving known error identities.
 */
export function safeError(value: unknown): JobAdminError {
  return value instanceof JobAdminError
    ? value
    : newAdminError("RELKIT_JOB_ADMIN_ACTION_FAILED", "Job admin action failed");
}

/** Checks that an unknown value names a supported queue state.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a supported lifecycle state.
 */
export function isState(value: unknown): value is JobQueueEntry["state"] {
  return ["accepted", "available", "leased", "delayed", "completed", "dead-lettered"].includes(
    value as string,
  );
}

/** Checks for a non-null, non-array object before inspecting unknown fields.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Constructs the established error class and code used by job administration.
 * @param code - Stable public or native error code.
 * @param message - Public failure message or browser message value.
 * @returns The public error with its supplied code and message.
 */
export function newAdminError(code: string, message: string): JobAdminError {
  return new JobAdminError(code, message);
}
