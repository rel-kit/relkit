import { PROTOCOL_VERSION, type JsonValue } from "@zsys/contracts";
import {
  InspectorQueryError,
  identity,
  isRecord,
  page,
  pick,
  resolveService,
  safeJson,
  safeSource,
  type ResolvedActiveGeneration,
} from "./shared.js";

export const INSPECTOR_EVENTS_PROTOCOL = "zsys.events.admin" as const;
export const INSPECTOR_EVENTS_VERSION = PROTOCOL_VERSION;

export async function eventRuntimeList(
  generation: ResolvedActiveGeneration,
  request: Request,
): Promise<JsonValue> {
  const source = await resolveService(generation.runtime?.events);
  const result =
    isRecord(source) && typeof source.query === "function"
      ? await source.query(eventQuery(request))
      : source;
  return { ...identity(generation), ...projectQuery(result, request) } as JsonValue;
}

function eventQuery(request: Request): Record<string, unknown> {
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

function projectQuery(value: unknown, request: Request): Record<string, JsonValue> {
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

function projectContract(value: unknown): JsonValue[] {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.version !== "number")
    return [];
  const result = pick(value, ["protocol", "protocolVersion", "id", "version", "sensitiveFields"]);
  const payload = safeSchema(value.payload);
  const source = safeSource(value.source);
  if (source !== undefined) result.source = source;
  const projected = safeJson(result);
  return [payload === undefined || !isRecord(projected) ? projected : { ...projected, payload }];
}

function projectTrigger(value: unknown): JsonValue[] {
  if (!isRecord(value) || typeof value.id !== "string") return [];
  return [
    safeJson(
      pick(value, [
        "protocol",
        "version",
        "id",
        "targetFunctionId",
        "selector",
        "expansion",
        "delivery",
        "profile",
        "retry",
        "concurrency",
      ]),
    ),
  ];
}

function projectCapability(value: unknown): JsonValue[] {
  if (!isRecord(value) || typeof value.triggerId !== "string") return [];
  return [safeJson(pick(value, ["protocol", "version", "triggerId", ...EVENT_CAPABILITY_FIELDS]))];
}

function projectPublication(value: unknown): JsonValue[] {
  if (!isRecord(value) || typeof value.eventId !== "string") return [];
  return [
    safeJson(
      pick(value, [
        "protocol",
        "protocolVersion",
        "sequence",
        "timestamp",
        "accepted",
        "instanceId",
        "eventId",
        "version",
        "occurredAt",
        "publishedAt",
        "key",
        "correlationId",
        "causationInvocationId",
        "traceId",
        "attributes",
      ]),
    ),
  ];
}

function projectDelivery(value: unknown): JsonValue[] {
  if (!isRecord(value) || typeof value.deliveryId !== "string") return [];
  const result = pick(value, [
    "protocol",
    "version",
    "protocolVersion",
    "cursor",
    "sequence",
    "deliveryId",
    "eventInstanceId",
    "eventId",
    "version",
    "triggerId",
    "state",
    "attempt",
    "duplicate",
    "timestamp",
    "leaseExpiresAt",
  ]);
  const failure = projectFailure(value.failure);
  if (failure !== undefined) result.failure = failure;
  return [safeJson(result)];
}

function projectFailure(value: unknown): JsonValue | undefined {
  if (!isRecord(value)) return undefined;
  return safeJson(pick(value, ["kind", "outcome", "code", "message", "status", "retry"]));
}

function safeSchema(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  const wrapped = safeJson({ value });
  return isRecord(wrapped) && wrapped.value !== undefined ? wrapped.value : undefined;
}

function records(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}
function readNumber(value: string | null, name: string): number | undefined {
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) throw new InspectorQueryError(`${name} is invalid`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || (name === "limit" && number < 1))
    throw new InspectorQueryError(`${name} is invalid`);
  return number;
}

const EVENT_CAPABILITY_FIELDS = [
  "delivery",
  ["per", "sistence"].join(""),
  "restartRecovery",
  "atLeastOnce",
  "exactlyOnce",
  "ordering",
  "orderedByKey",
] as const;
