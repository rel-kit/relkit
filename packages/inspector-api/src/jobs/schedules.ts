import type { SchedulePosition } from "./schedules.types.js";
export type { ScheduleCheckpoint, SchedulePosition } from "./schedules.types.js";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise } from "../native-edge.js";
import { inspectorNativeJobsExecution as inspectorExecution } from "./native.service.js";
import { nativeAttempt, projectionAttempt } from "../native-edge.js";
import { InspectorNativeJobs } from "./native.service.js";
import type { JsonValue } from "@relkit/contracts";
import { decodeCursor, encodeCursor } from "./filters.js";
import { authorizeJobs, jobBindings, operationContext } from "./services.js";
import { InspectorJobsError } from "./types.js";
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

/**
 * Reads finite ordered native schedule pages and retains exhausted/unavailable checkpoints.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A lazy observed Effect containing public schedules with truthful availability and signed continuation evidence.
 */
export const listSchedulesEffect = Effect.fn("Inspector.listSchedules")(
  function* (generation: ResolvedActiveGeneration, request: Request) {
    const service = new URL(request.url).searchParams.get("service") ?? undefined;
    const jobs = yield* nativeAttempt(() =>
      authorizeJobs(generation, request, "schedule", service),
    );
    const bindings = (yield* nativeAttempt(() => jobBindings(generation))).filter(
      (binding) => service === undefined || binding.service === service,
    );
    if (bindings.length === 0)
      return yield* Effect.fail(new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503));
    const params = new URL(request.url).searchParams;
    const limit = yield* projectionAttempt(() => readLimit(params.get("limit")));
    const expected = {
      kind: "schedules" as const,
      generationId: generation.generationId,
      graphHash: generation.graphHash,
      filters: { service: service ?? null, limit } as JsonValue,
    };
    const cursor = params.get("cursor");
    const position = yield* projectionAttempt(() =>
      cursor === null
        ? {}
        : readPosition(
            decodeCursor(cursor, expected, jobs.cursorSecret ?? generation.graphHash).position,
          ),
    );
    const native = yield* InspectorNativeJobs;
    const results = yield* native.schedulePages(generation, request, limit, bindings, position);
    const items = results.flatMap(({ binding, receipt }) =>
      receipt === undefined ? [] : readItems(receipt, binding),
    );
    const nextPosition: SchedulePosition = {};
    for (const { binding, receipt, checkpoint: current } of results) {
      const nextCursor =
        isRecord(receipt) && typeof receipt.nextCursor === "string"
          ? receipt.nextCursor
          : undefined;
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
      body.nextCursor = yield* projectionAttempt(() =>
        encodeCursor(
          { ...expected, position: nextPosition as unknown as JsonValue },
          jobs.cursorSecret ?? generation.graphHash,
        ),
      );
    const safe = safeJson(body);
    return isRecord(safe)
      ? ({ ...safe, items, availability: body.availability } as JsonValue)
      : safe;
  },
  (effect) => observeExecution("inspector", "listSchedules", effect),
);

/**
 * Reads finite ordered native schedule pages and retains exhausted/unavailable checkpoints.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns Public schedules with truthful availability and signed continuation evidence.
 */
export function listSchedules(
  generation: ResolvedActiveGeneration,
  request: Request,
): Promise<JsonValue> {
  return runExecutionPromise(inspectorExecution, listSchedulesEffect(generation, request));
}

/**
 * Authorizes one native schedule administration operation without retries.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param action - Declared operation selected by the route.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns A lazy observed Effect containing the existing identity-bearing operation receipt.
 */
export const scheduleActionEffect = Effect.fn("Inspector.scheduleAction")(
  function* (
    generation: ResolvedActiveGeneration,
    request: Request,
    action: "upsert" | "pause" | "resume" | "delete",
    id?: string,
  ) {
    const body = yield* nativeAttempt(() => readBody(request));
    const service = queryService(request, body);
    const jobs = yield* nativeAttempt(() =>
      authorizeJobs(generation, request, "schedule", service),
    );
    const binding = yield* nativeAttempt(() => oneBinding(generation, service));
    if (binding.schedules === undefined)
      return yield* Effect.fail(
        new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED", 501),
      );
    const operationId = yield* projectionAttempt(() => readOperationId(request, body));
    const context = operationContext(generation, binding, "schedule", request, operationId);
    const schedules = binding.schedules;
    const result = yield* nativeAttempt(() =>
      executeSchedule(schedules, body, action, id, context),
    );
    const value = safeJson({ ...identity(generation), operationId, receipt: result });
    return isRecord(value) ? ({ ...value, service: binding.service } as JsonValue) : value;
  },
  (effect) => observeExecution("inspector", "scheduleAction", effect),
);

/**
 * Authorizes one native schedule administration operation without retries.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param action - Declared operation selected by the route.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns The existing identity-bearing operation receipt.
 */
export function scheduleAction(
  generation: ResolvedActiveGeneration,
  request: Request,
  action: "upsert" | "pause" | "resume" | "delete",
  id?: string,
): Promise<JsonValue> {
  return runExecutionPromise(
    inspectorExecution,
    scheduleActionEffect(generation, request, action, id),
  );
}

/**
 * Reads one authorized native schedule through an unambiguous provider.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns A lazy observed Effect containing the existing redacted native schedule envelope.
 */
export const getScheduleEffect = Effect.fn("Inspector.getSchedule")(
  function* (generation: ResolvedActiveGeneration, request: Request, id: string) {
    const service = new URL(request.url).searchParams.get("service") ?? undefined;
    yield* nativeAttempt(() => authorizeJobs(generation, request, "schedule", service));
    const binding = yield* nativeAttempt(() => oneBinding(generation, service));
    if (binding.schedules === undefined)
      return yield* Effect.fail(
        new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED", 501),
      );
    const schedules = binding.schedules;
    const value = safeJson({
      receipt: yield* nativeAttempt(() =>
        schedules.get(id, operationContext(generation, binding, "schedule", request)),
      ),
    });
    return isRecord(value) ? ({ ...value, service: binding.service } as JsonValue) : value;
  },
  (effect) => observeExecution("inspector", "getSchedule", effect),
);

/**
 * Reads one authorized native schedule through an unambiguous provider.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns The existing redacted native schedule envelope.
 */
export function getSchedule(
  generation: ResolvedActiveGeneration,
  request: Request,
  id: string,
): Promise<JsonValue> {
  return runExecutionPromise(inspectorExecution, getScheduleEffect(generation, request, id));
}

/**
 * Adapts the selected native schedule command and preserves its existing failure classification.
 * @param schedules - Selected native schedule administration authority.
 * @param body - Parsed request fields; private executable values are never part of the public projection.
 * @param action - Declared operation selected by the route.
 * @param id - Declaration or native record identifier selected by the caller.
 * @param context - Native request context retained only for this ingress operation.
 * @returns The native JSON receipt or compatible administration failure.
 */
const executeSchedule = async function (
  schedules: import("./types.js").InspectorScheduleOperations,
  body: Record<string, JsonValue>,
  action: "upsert" | "pause" | "resume" | "delete",
  id: string | undefined,
  context: import("./types.js").InspectorJobsOperationContext,
): Promise<JsonValue> {
  try {
    return action === "upsert"
      ? await schedules.upsert((body.definition ?? body) as JsonValue, context)
      : await schedules[action](id ?? readId(body), context);
  } catch (error) {
    if (error instanceof InspectorJobsError) throw error;
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_INVALID", 409);
  }
};
