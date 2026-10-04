import type { JsonValue } from "@relkit/contracts";
import { jobBindings } from "./services.js";
import { InspectorJobsError, type InspectorJobsBinding } from "./types.js";
import { isRecord, safeJson, type ResolvedActiveGeneration } from "../shared.js";
import type { ScheduleCheckpoint, SchedulePosition } from "./schedules.js";

/**
 * Selects one unambiguous native jobs service before administration.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param service - Optional service selector; ambiguous selections are rejected.
 * @returns The selected authority or existing unavailable/ambiguous-service failure.
 */
export async function oneBinding(
  generation: ResolvedActiveGeneration,
  service: string | undefined,
): Promise<InspectorJobsBinding> {
  const bindings = await jobBindings(generation);
  if (service === undefined && bindings.length !== 1)
    throw new InspectorJobsError(
      "RELKIT_INSPECTOR_JOBS_FILTER_INVALID",
      400,
      "service is required",
    );
  const binding =
    bindings.find((value) => value.service === service) ??
    (service === undefined ? bindings[0] : undefined);
  if (binding === undefined) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503);
  return binding;
}

/**
 * Projects native schedule receipts while retaining public service identity.
 * @param receipt - Native schedule receipt to project with its owning service identity.
 * @param binding - Selected native job authority and its service identity.
 * @returns Public schedule records in native receipt order.
 */
export function readItems(receipt: JsonValue, binding: InspectorJobsBinding): JsonValue[] {
  if (!isRecord(receipt) || !Array.isArray(receipt.schedules)) return [];
  return receipt.schedules
    .filter((value): value is JsonValue => value !== undefined)
    .map((schedule) => {
      const value = safeJson({ schedule });
      return isRecord(value) ? ({ ...value, service: binding.service } as JsonValue) : value;
    });
}

/**
 * Validates the decoded continuation position before using it.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns An accepted continuation position or the existing cursor failure.
 */
export function readPosition(value: JsonValue): SchedulePosition {
  if (!isRecord(value)) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  const entries = Object.entries(value);
  if (
    entries.some(
      ([, entry]) =>
        !isRecord(entry) ||
        !isScheduleState(entry.state) ||
        (entry.cursor !== undefined && typeof entry.cursor !== "string") ||
        (entry.reason !== undefined && typeof entry.reason !== "string"),
    )
  )
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  return Object.fromEntries(
    entries.map(([service, entry]) => [
      service,
      {
        state: (entry as Record<string, unknown>).state,
        ...((entry as Record<string, unknown>).cursor === undefined
          ? {}
          : { cursor: (entry as Record<string, unknown>).cursor }),
        ...((entry as Record<string, unknown>).reason === undefined
          ? {}
          : { reason: (entry as Record<string, unknown>).reason }),
      },
    ]),
  ) as SchedulePosition;
}

/**
 * Validates a bounded native jobs page size.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns The accepted page size or existing filter error.
 */
export function readLimit(value: string | null): number {
  if (value === null || value === "") return 25;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > 100)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400);
  return result;
}

/**
 * Selects the existing service selector precedence from URL and body.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param body - Parsed request fields; private executable values are never part of the public projection.
 * @returns The requested service or undefined.
 */
export function queryService(
  request: Request,
  body: Record<string, JsonValue>,
): string | undefined {
  return (
    new URL(request.url).searchParams.get("service") ??
    (typeof body.service === "string" ? body.service : undefined)
  );
}

/**
 * Requires a bounded native administration operation identifier.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param body - Parsed request fields; private executable values are never part of the public projection.
 * @returns The existing operation identifier or invalid-operation failure.
 */
export function readOperationId(request: Request, body: Record<string, JsonValue>): string {
  const value =
    request.headers.get("x-relkit-operation-id") ??
    (typeof body.operationId === "string" ? body.operationId : undefined);
  if (value === undefined || value.length === 0 || value.length > 256)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_INVALID", 400);
  return value;
}

/**
 * Requires a nonempty native schedule identity from the body.
 * @param body - Parsed request fields; private executable values are never part of the public projection.
 * @returns The supplied native schedule identifier.
 */
export function readId(body: Record<string, JsonValue>): string {
  if (typeof body.id !== "string" || body.id.length === 0)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_INVALID", 400);
  return body.id;
}

/**
 * Reads the native request body once and validates the existing object-body contract.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns Parsed object fields or the existing invalid-body failure.
 */
export async function readBody(request: Request): Promise<Record<string, JsonValue>> {
  const raw = await request.text();
  if (raw.trim() === "") return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (isRecord(value)) return value as Record<string, JsonValue>;
  } catch {}
  throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_INVALID", 400);
}

/**
 * Accepts only signed schedule continuation state vocabulary.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Whether the value is active, exhausted or unavailable.
 */
function isScheduleState(value: unknown): value is ScheduleCheckpoint["state"] {
  return value === "active" || value === "exhausted" || value === "unavailable";
}
