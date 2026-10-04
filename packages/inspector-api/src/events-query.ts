import { type JsonValue } from "@relkit/contracts";
import { InspectorQueryError, isRecord, page } from "./shared.js";
import {
  records,
  projectContract,
  projectTrigger,
  projectCapability,
  projectPublication,
  projectDelivery,
} from "./events-projection.js";

/**
 * Parses only supported event filters and validates their declared numeric bounds.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A native events query preserving unsupported-filter behavior.
 */
export function eventQuery(request: Request): Record<string, unknown> {
  const params = new URL(request.url).searchParams;
  const query: Record<string, unknown> = {
    protocol: INSPECTOR_EVENTS_PROTOCOL,
    version: INSPECTOR_EVENTS_VERSION,
  };
  for (const key of ["eventId", "triggerId", "state", "cursor"]) {
    const value = params.get(key);
    if (value !== null) query[key] = value;
  }
  const eventVersion = readNumber(params.get("eventVersion"), "eventVersion");
  const limit = readNumber(params.get("limit"), "limit");
  if (eventVersion !== undefined) query.eventVersion = eventVersion;
  if (limit !== undefined) query.limit = limit;
  return query;
}

/**
 * Projects native event query records into the existing runtime response.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns Redacted public events evidence and continuation fields.
 */
export function projectQuery(value: unknown, request: Request): Record<string, JsonValue> {
  if (!isRecord(value)) {
    const items = Array.isArray(value) ? value.flatMap(projectDelivery) : [];
    return {
      eventProtocol: INSPECTOR_EVENTS_PROTOCOL,
      eventVersion: INSPECTOR_EVENTS_VERSION,
      events: [],
      triggers: [],
      capabilities: [],
      publications: [],
      ...page(items, request),
      deliveries: items,
      deadLetters: items.filter((item) => isRecord(item) && item.state === "dead-lettered"),
    };
  }
  const deliveries = records(value.deliveries ?? value.items).flatMap(projectDelivery);
  const deadLetters = records(value.deadLetters).flatMap(projectDelivery);
  const filteredDeadLetters =
    deadLetters.length > 0
      ? deadLetters
      : deliveries.filter((item) => isRecord(item) && item.state === "dead-lettered");
  return {
    eventProtocol: typeof value.protocol === "string" ? value.protocol : INSPECTOR_EVENTS_PROTOCOL,
    eventVersion:
      typeof value.version === "number" && Number.isSafeInteger(value.version)
        ? value.version
        : INSPECTOR_EVENTS_VERSION,
    events: records(value.events ?? value.contracts).flatMap(projectContract),
    triggers: records(value.triggers).flatMap(projectTrigger),
    capabilities: records(value.capabilities).flatMap(projectCapability),
    publications: records(value.publications).flatMap(projectPublication),
    items: deliveries,
    deliveries,
    deadLetters: filteredDeadLetters,
    ...(typeof value.nextCursor === "string" ? { nextCursor: value.nextCursor } : {}),
  };
}

/**
 * Validates optional integer event-query fields against their declared bounds.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param name - Public field or route parameter name.
 * @returns The accepted integer or undefined when absent.
 */
export function readNumber(value: string | null, name: string): number | undefined {
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) throw new InspectorQueryError(`${name} is invalid`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || (name === "limit" && number < 1))
    throw new InspectorQueryError(`${name} is invalid`);
  return number;
}
import { INSPECTOR_EVENTS_PROTOCOL, INSPECTOR_EVENTS_VERSION } from "./events-runtime.js";
