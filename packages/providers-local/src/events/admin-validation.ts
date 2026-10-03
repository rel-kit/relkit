import { normalizeId } from "@relkit/contracts";
import {
  EVENT_ADMIN_PROTOCOL,
  EVENT_ADMIN_VERSION,
  type EventAdminMode,
  type EventQueryRequest,
} from "./admin-contracts.js";
import { EventAdminError } from "./admin-errors.js";

/** Validates the requested inspection page size and enforces its maximum.
 * @param value - Value to validate, normalize or project.
 * @returns The validated page size capped at the inspection maximum.
 */
export function pageLimit(value: number | undefined): number {
  if (value === undefined) return 50;
  if (!Number.isSafeInteger(value) || value < 1)
    throw new EventAdminError("RELKIT_EVENT_ADMIN_QUERY_INVALID", "Event query limit is invalid");
  return Math.min(value, 100);
}

/** Rejects unsupported event inspection filters before collecting records.
 * @param request - Caller domain request.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
export function validateQuery(request: EventQueryRequest): void {
  if (request.eventId !== undefined) normalizeId(request.eventId);
  if (request.triggerId !== undefined) normalizeId(request.triggerId);
  if (
    request.eventVersion !== undefined &&
    (!Number.isSafeInteger(request.eventVersion) || request.eventVersion < 1)
  )
    throw new EventAdminError("RELKIT_EVENT_ADMIN_QUERY_INVALID", "Event version is invalid");
  const states = request.states ?? (request.state === undefined ? [] : [request.state]);
  if (states.some((state) => !isState(state)))
    throw new EventAdminError("RELKIT_EVENT_ADMIN_QUERY_INVALID", "Event query state is invalid");
}

/** Rejects malformed requests or unsupported event-admin protocol versions.
 * @param value - Value to validate, normalize or project.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
export function assertVersion(value: unknown): void {
  if (!isRecord(value))
    throw new EventAdminError(
      "RELKIT_EVENT_ADMIN_REQUEST_INVALID",
      "Event admin request is invalid",
    );
  if (
    (value.protocol !== undefined && value.protocol !== EVENT_ADMIN_PROTOCOL) ||
    (value.version !== undefined && value.version !== EVENT_ADMIN_VERSION)
  )
    throw new EventAdminError(
      "RELKIT_EVENT_ADMIN_PROTOCOL_MISMATCH",
      "Unsupported event admin protocol",
    );
}

/** Restricts event administration to a supported environment mode.
 * @param value - Value to validate, normalize or project.
 * @returns Nothing; rejects invalid input with the established domain error.
 */
export function assertMode(value: string): asserts value is EventAdminMode {
  if (value !== "development" && value !== "test" && value !== "production")
    throw new EventAdminError("RELKIT_EVENT_ADMIN_MODE_INVALID", "Event admin mode is invalid");
}

/** Normalizes an identifier or returns undefined for an invalid value.
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
    throw new EventAdminError(
      "RELKIT_EVENT_ADMIN_REQUEST_INVALID",
      "Event action reason is invalid",
    );
  return value.reason.trim().slice(0, 256);
}

/** Checks whether an unknown value names a supported delivery state.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a supported lifecycle state.
 */
export function isState(value: unknown): boolean {
  return ["available", "leased", "delayed", "completed", "dead-lettered"].includes(value as string);
}

/** Checks for a non-null, non-array object before inspecting unknown fields.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
