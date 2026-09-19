import type { JsonValue } from "@relkit/contracts";
import { decodeCursor, encodeCursor, type InspectorCursor } from "./filters.js";
import { authorizeJobs, jobBindings, operationContext } from "./services.js";
import { InspectorJobsError, type InspectorJobsBinding } from "./types.js";
import { identity, safeJson, type ResolvedActiveGeneration } from "../shared.js";

interface ScheduleCheckpoint {
  readonly state: "active" | "exhausted" | "unavailable";
  readonly cursor?: string;
  readonly reason?: string;
}
type SchedulePosition = Record<string, ScheduleCheckpoint>;
interface ScheduleResult {
  readonly binding: InspectorJobsBinding;
  readonly receipt?: JsonValue;
  readonly checkpoint: ScheduleCheckpoint;
}

export async function listSchedules(generation: ResolvedActiveGeneration, request: Request): Promise<JsonValue> {
  const service = new URL(request.url).searchParams.get("service") ?? undefined;
  const jobs = await authorizeJobs(generation, request, "schedule", service);
  const bindings = (await jobBindings(generation)).filter((binding) => service === undefined || binding.service === service);
  if (bindings.length === 0) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503);
  const params = new URL(request.url).searchParams;
  const limit = readLimit(params.get("limit"));
  const expected = { kind: "schedules" as const, generationId: generation.generationId, graphHash: generation.graphHash, filters: { service: service ?? null, limit } as JsonValue };
  const cursor = params.get("cursor");
  const position = cursor === null ? {} : readPosition(decodeCursor(cursor, expected, jobs.cursorSecret ?? generation.graphHash).position);
  const results = await Promise.all(bindings.map(async (binding): Promise<ScheduleResult> => {
    const checkpoint = position[binding.service];
    if (checkpoint?.state === "exhausted" || checkpoint?.state === "unavailable") return { binding, checkpoint };
    if (binding.schedules === undefined) return { binding, checkpoint: { state: "unavailable" as const, reason: "schedules unsupported" } };
    try {
      const receipt = await binding.schedules.list({ limit, ...(checkpoint?.cursor === undefined ? {} : { cursor: checkpoint.cursor }) }, operationContext(generation, binding, "schedule", request));
      return { binding, receipt, checkpoint: { state: "active" as const } };
    } catch {
      return { binding, checkpoint: { state: "unavailable" as const, reason: "native service unavailable" } };
    }
  }));
  const items = results.flatMap(({ binding, receipt }) => receipt === undefined ? [] : readItems(receipt, binding));
  const nextPosition: SchedulePosition = {};
  for (const { binding, receipt, checkpoint: current } of results) {
    const nextCursor = isRecord(receipt) && typeof receipt.nextCursor === "string" ? receipt.nextCursor : undefined;
    const checkpoint = nextCursor === undefined
      ? { state: "exhausted" as const }
      : { state: "active" as const, cursor: nextCursor };
    nextPosition[binding.service] = receipt === undefined ? current : checkpoint;
  }
  const hasMore = Object.values(nextPosition).some((checkpoint) => checkpoint.state === "active");
  const body: Record<string, unknown> = {
    ...identity(generation), items, hasMore,
    availability: results.map(({ binding, checkpoint }) => ({ service: binding.service, state: checkpoint.state === "unavailable" ? "unavailable" : "available", ...(checkpoint.reason === undefined ? {} : { reason: checkpoint.reason }) })),
  };
  if (hasMore) body.nextCursor = encodeCursor({ ...expected, position: nextPosition as unknown as JsonValue }, jobs.cursorSecret ?? generation.graphHash);
  const safe = safeJson(body);
  return isRecord(safe) ? { ...safe, items, availability: body.availability } as JsonValue : safe;
}

export async function scheduleAction(
  generation: ResolvedActiveGeneration,
  request: Request,
  action: "upsert" | "pause" | "resume" | "delete",
  id?: string,
): Promise<JsonValue> {
  const body = await readBody(request);
  const service = queryService(request, body);
  const jobs = await authorizeJobs(generation, request, "schedule", service);
  const binding = await oneBinding(generation, service);
  if (binding.schedules === undefined) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED", 501);
  const operationId = readOperationId(request, body);
  const context = operationContext(generation, binding, "schedule", request, operationId);
  try {
    const result = action === "upsert"
      ? await binding.schedules.upsert((body.definition ?? body) as JsonValue, context)
      : await binding.schedules[action](id ?? readId(body), context);
    const value = safeJson({ ...identity(generation), operationId, receipt: result });
    return isRecord(value) ? { ...value, service: binding.service } as JsonValue : value;
  } catch (error) {
    if (error instanceof InspectorJobsError) throw error;
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_INVALID", 409);
  }
}

export async function getSchedule(
  generation: ResolvedActiveGeneration,
  request: Request,
  id: string,
): Promise<JsonValue> {
  const service = new URL(request.url).searchParams.get("service") ?? undefined;
  await authorizeJobs(generation, request, "schedule", service);
  const binding = await oneBinding(generation, service);
  if (binding.schedules === undefined) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED", 501);
  const value = safeJson({ receipt: await binding.schedules.get(id, operationContext(generation, binding, "schedule", request)) });
  return isRecord(value) ? { ...value, service: binding.service } as JsonValue : value;
}

async function oneBinding(generation: ResolvedActiveGeneration, service: string | undefined): Promise<InspectorJobsBinding> {
  const bindings = await jobBindings(generation);
  if (service === undefined && bindings.length !== 1) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400, "service is required");
  const binding = bindings.find((value) => value.service === service) ?? (service === undefined ? bindings[0] : undefined);
  if (binding === undefined) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503);
  return binding;
}
function readItems(receipt: JsonValue, binding: InspectorJobsBinding): JsonValue[] {
  if (!isRecord(receipt) || !Array.isArray(receipt.schedules)) return [];
  return receipt.schedules.filter((value): value is JsonValue => value !== undefined).map((schedule) => {
    const value = safeJson({ schedule });
    return isRecord(value) ? { ...value, service: binding.service } as JsonValue : value;
  });
}
function readPosition(value: JsonValue): SchedulePosition {
  if (!isRecord(value)) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  const entries = Object.entries(value);
  if (entries.some(([, entry]) => !isRecord(entry) || !isScheduleState(entry.state) || (entry.cursor !== undefined && typeof entry.cursor !== "string") || (entry.reason !== undefined && typeof entry.reason !== "string")))
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_CURSOR_INVALID", 400);
  return Object.fromEntries(entries.map(([service, entry]) => [service, {
    state: (entry as Record<string, unknown>).state,
    ...((entry as Record<string, unknown>).cursor === undefined ? {} : { cursor: (entry as Record<string, unknown>).cursor }),
    ...((entry as Record<string, unknown>).reason === undefined ? {} : { reason: (entry as Record<string, unknown>).reason }),
  }])) as SchedulePosition;
}
function readLimit(value: string | null): number { if (value === null || value === "") return 25; const result = Number(value); if (!Number.isSafeInteger(result) || result < 1 || result > 100) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_FILTER_INVALID", 400); return result; }
function queryService(request: Request, body: Record<string, JsonValue>): string | undefined { return new URL(request.url).searchParams.get("service") ?? (typeof body.service === "string" ? body.service : undefined); }
function readOperationId(request: Request, body: Record<string, JsonValue>): string { const value = request.headers.get("x-relkit-operation-id") ?? (typeof body.operationId === "string" ? body.operationId : undefined); if (value === undefined || value.length === 0 || value.length > 256) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_INVALID", 400); return value; }
function readId(body: Record<string, JsonValue>): string { if (typeof body.id !== "string" || body.id.length === 0) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_INVALID", 400); return body.id; }
async function readBody(request: Request): Promise<Record<string, JsonValue>> {
  const raw = await request.text();
  if (raw.trim() === "") return {};
  try { const value: unknown = JSON.parse(raw); if (isRecord(value)) return value as Record<string, JsonValue>; } catch {}
  throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_INVALID", 400);
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isScheduleState(value: unknown): value is ScheduleCheckpoint["state"] { return value === "active" || value === "exhausted" || value === "unavailable"; }
