import type { JsonValue } from "@relkit/contracts";
import { decodeCursor, encodeCursor, type InspectorCursor } from "./filters.js";
import { authorizeJobs, jobBindings, operationContext } from "./services.js";
import { InspectorJobsError, type InspectorJobsBinding } from "./types.js";
import { identity, isRecord, safeJson, type ResolvedActiveGeneration } from "../shared.js";
import {
  oneBinding,
  queryService,
  readBody,
  readId,
  readItems,
  readLimit,
  readOperationId,
  readPosition,
} from "./schedules-support.js";

export interface ScheduleCheckpoint {
  readonly state: "active" | "exhausted" | "unavailable";
  readonly cursor?: string;
  readonly reason?: string;
}
export type SchedulePosition = Record<string, ScheduleCheckpoint>;
interface ScheduleResult {
  readonly binding: InspectorJobsBinding;
  readonly receipt?: JsonValue;
  readonly checkpoint: ScheduleCheckpoint;
}

export async function listSchedules(
  generation: ResolvedActiveGeneration,
  request: Request,
): Promise<JsonValue> {
  const service = new URL(request.url).searchParams.get("service") ?? undefined;
  const jobs = await authorizeJobs(generation, request, "schedule", service);
  const bindings = (await jobBindings(generation)).filter(
    (binding) => service === undefined || binding.service === service,
  );
  if (bindings.length === 0) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503);
  const params = new URL(request.url).searchParams;
  const limit = readLimit(params.get("limit"));
  const expected = {
    kind: "schedules" as const,
    generationId: generation.generationId,
    graphHash: generation.graphHash,
    filters: { service: service ?? null, limit } as JsonValue,
  };
  const cursor = params.get("cursor");
  const position =
    cursor === null
      ? {}
      : readPosition(
          decodeCursor(cursor, expected, jobs.cursorSecret ?? generation.graphHash).position,
        );
  const results = await Promise.all(
    bindings.map(async (binding): Promise<ScheduleResult> => {
      const checkpoint = position[binding.service];
      if (checkpoint?.state === "exhausted" || checkpoint?.state === "unavailable")
        return { binding, checkpoint };
      if (binding.schedules === undefined)
        return {
          binding,
          checkpoint: { state: "unavailable" as const, reason: "schedules unsupported" },
        };
      try {
        const receipt = await binding.schedules.list(
          { limit, ...(checkpoint?.cursor === undefined ? {} : { cursor: checkpoint.cursor }) },
          operationContext(generation, binding, "schedule", request),
        );
        return { binding, receipt, checkpoint: { state: "active" as const } };
      } catch {
        return {
          binding,
          checkpoint: { state: "unavailable" as const, reason: "native service unavailable" },
        };
      }
    }),
  );
  const items = results.flatMap(({ binding, receipt }) =>
    receipt === undefined ? [] : readItems(receipt, binding),
  );
  const nextPosition: SchedulePosition = {};
  for (const { binding, receipt, checkpoint: current } of results) {
    const nextCursor =
      isRecord(receipt) && typeof receipt.nextCursor === "string" ? receipt.nextCursor : undefined;
    const checkpoint =
      nextCursor === undefined
        ? { state: "exhausted" as const }
        : { state: "active" as const, cursor: nextCursor };
    nextPosition[binding.service] = receipt === undefined ? current : checkpoint;
  }
  const hasMore = Object.values(nextPosition).some((checkpoint) => checkpoint.state === "active");
  const body: Record<string, unknown> = {
    ...identity(generation),
    items,
    hasMore,
    availability: results.map(({ binding, checkpoint }) => ({
      service: binding.service,
      state: checkpoint.state === "unavailable" ? "unavailable" : "available",
      ...(checkpoint.reason === undefined ? {} : { reason: checkpoint.reason }),
    })),
  };
  if (hasMore)
    body.nextCursor = encodeCursor(
      { ...expected, position: nextPosition as unknown as JsonValue },
      jobs.cursorSecret ?? generation.graphHash,
    );
  const safe = safeJson(body);
  return isRecord(safe) ? ({ ...safe, items, availability: body.availability } as JsonValue) : safe;
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
  if (binding.schedules === undefined)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED", 501);
  const operationId = readOperationId(request, body);
  const context = operationContext(generation, binding, "schedule", request, operationId);
  try {
    const result =
      action === "upsert"
        ? await binding.schedules.upsert((body.definition ?? body) as JsonValue, context)
        : await binding.schedules[action](id ?? readId(body), context);
    const value = safeJson({ ...identity(generation), operationId, receipt: result });
    return isRecord(value) ? ({ ...value, service: binding.service } as JsonValue) : value;
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
  if (binding.schedules === undefined)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED", 501);
  const value = safeJson({
    receipt: await binding.schedules.get(
      id,
      operationContext(generation, binding, "schedule", request),
    ),
  });
  return isRecord(value) ? ({ ...value, service: binding.service } as JsonValue) : value;
}
