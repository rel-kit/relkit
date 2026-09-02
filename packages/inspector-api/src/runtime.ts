import type { JsonValue } from "@relkit/contracts";
import { eventRuntimeList } from "./events-runtime.js";
import { projectRuntimeMetadata } from "./runtime-metadata.js";
import {
  identity,
  isRecord,
  page,
  pick,
  resolveCollection,
  resolveItem,
  safeJson,
  safeSource,
  type ResolvedActiveGeneration,
} from "./shared.js";

export const RUNTIME_COLLECTIONS = Object.freeze([
  "functions",
  "jobs",
  "events",
  "buckets",
  "cache",
  "tools",
  "agents",
] as const);
export type RuntimeCollection = (typeof RUNTIME_COLLECTIONS)[number];

const RUNTIME_FIELDS = [
  "id",
  "functionId",
  "jobId",
  "instanceId",
  "eventId",
  "eventVersion",
  "deliveryId",
  "bucketId",
  "cacheId",
  "toolId",
  "agentId",
  "turnId",
  "profile",
  "status",
  "state",
  "outcome",
  "approval",
  "sideEffect",
  "invocationId",
  "requestId",
  "traceId",
  "triggerId",
  "toolCallId",
  "parentSpanId",
  "step",
  "attempt",
  "acceptedAt",
  "availableAt",
  "leaseExpiresAt",
  "idempotencyExpiresAt",
  "nextRun",
  "nextRunAt",
  "nextFireAt",
  "schedules",
  "startedAt",
  "completedAt",
  "durationMs",
  "timeoutMs",
  "concurrency",
  "declaredEdges",
  "observedEdges",
  "failure",
  "errorId",
  "occurredAt",
  "capabilities",
  "policy",
  "schemaVersion",
  "bytes",
  "objects",
  "entries",
  "hits",
  "misses",
  "evictions",
  "inFlight",
  "inputBytes",
  "outputBytes",
];

export class InspectorRuntimeError extends Error {
  constructor(
    readonly code: "RELKIT_INSPECTOR_RUNTIME_UNAVAILABLE" | "RELKIT_INSPECTOR_NOT_FOUND",
    readonly status: 404 | 503,
  ) {
    super(code);
    this.name = "InspectorRuntimeError";
  }
}

export async function runtimeSnapshot(generation: ResolvedActiveGeneration): Promise<JsonValue> {
  const entries = await Promise.all(
    RUNTIME_COLLECTIONS.map(async (collection) => {
      const items = await runtimeItems(generation, collection);
      return [collection, { count: items.length, items }] as const;
    }),
  );
  return {
    ...identity(generation),
    state: Object.fromEntries(entries),
    ...projectRuntimeMetadata(generation),
  } as JsonValue;
}

export async function runtimeList(
  generation: ResolvedActiveGeneration,
  collection: RuntimeCollection,
  request: Request,
): Promise<JsonValue> {
  if (collection === "events") return eventRuntimeList(generation, request);
  const items = await runtimeItems(generation, collection);
  return { ...identity(generation), ...page(items, request) } as JsonValue;
}

export async function runtimeDetail(
  generation: ResolvedActiveGeneration,
  collection: RuntimeCollection,
  id: string,
): Promise<JsonValue> {
  const source = runtimeSource(generation, collection);
  let item = await resolveItem(source, id);
  if (item === undefined)
    item = (await runtimeItems(generation, collection)).find((value) => itemId(value) === id);
  if (item === undefined) throw new InspectorRuntimeError("RELKIT_INSPECTOR_NOT_FOUND", 404);
  return { ...identity(generation), state: projectItem(item) } as JsonValue;
}

async function runtimeItems(
  generation: ResolvedActiveGeneration,
  collection: RuntimeCollection,
): Promise<JsonValue[]> {
  const source = runtimeSource(generation, collection);
  if (source === undefined) return [];
  const value = await resolveCollection(source);
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.items)
      ? value.items
      : isRecord(value)
        ? [value]
        : [];
  return raw.flatMap((item) => {
    const projected = projectItem(item);
    return projected === undefined ? [] : [projected];
  });
}

function runtimeSource(
  generation: ResolvedActiveGeneration,
  collection: RuntimeCollection,
): unknown {
  if (collection === "cache") return generation.runtime?.cache ?? generation.runtime?.caches;
  return generation.runtime?.[collection];
}

function projectItem(value: unknown): JsonValue | undefined {
  if (!isRecord(value)) return undefined;
  const result = pick(value, RUNTIME_FIELDS);
  const source = safeSource(value.source);
  if (source !== undefined) result.source = source;
  const id = itemId(value);
  if (id !== undefined) result.id = id;
  return safeJson(result);
}

function itemId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of [
    "id",
    "functionId",
    "jobId",
    "instanceId",
    "eventId",
    "deliveryId",
    "bucketId",
    "cacheId",
    "toolId",
    "agentId",
  ]) {
    if (typeof value[key] === "string" && value[key].length > 0) return value[key];
  }
  return undefined;
}
