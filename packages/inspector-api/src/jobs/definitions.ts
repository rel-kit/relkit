import type { JobDefinitionRecord } from "./definitions.types.js";
export type { JobDefinitionRecord } from "./definitions.types.js";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise, runInspectorSync } from "../native-edge.js";
import { inspectorNativeJobsExecution as inspectorExecution } from "./native.service.js";
import { projectionAttempt } from "../native-edge.js";
import type { JsonValue } from "@relkit/contracts";
import { cursorSecret, decodeCursor, encodeCursor } from "./filters.js";
import { InspectorJobsError, type InspectorJobsServices } from "./types.js";
import { identity, isRecord, pick, safeJson, type ResolvedActiveGeneration } from "../shared.js";
import {
  definitionLimit,
  definitions,
  filtersJson,
  graphNodes,
  matches,
  projectDefinition,
  readPosition,
  serviceHealthEffect,
  text,
} from "./definitions-support.js";

/**
 * Reads task-backed job declarations and bounded native health evidence.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param jobs - Optional native job authorities and read policy.
 * @returns A lazy observed Effect containing a bounded definition page with a signed continuation cursor.
 */
export const listJobDefinitionsEffect = Effect.fn("Inspector.listJobDefinitions")(
  function* (generation: ResolvedActiveGeneration, request: Request, jobs?: InspectorJobsServices) {
    const params = new URL(request.url).searchParams;
    const filters = yield* projectionAttempt(() => ({
      search: text(params.get("search")),
      job: text(params.get("job")),
      task: text(params.get("task")),
      service: text(params.get("service")),
      limit: definitionLimit(params.get("limit")),
    }));
    const all = definitions(generation, yield* serviceHealthEffect(jobs));
    const filtered = all.filter((item) => matches(item, filters));
    const cursorValue = params.get("cursor");
    const expected = {
      kind: "definitions" as const,
      generationId: generation.generationId,
      graphHash: generation.graphHash,
      filters: filtersJson(filters),
    };
    const position = yield* projectionAttempt(() =>
      cursorValue === null
        ? 0
        : decodeCursor(
            cursorValue,
            expected,
            cursorSecret(jobs?.cursorSecret, generation.graphHash),
          ).position,
    );
    const start = yield* projectionAttempt(() => readPosition(position));
    const items = filtered.slice(start, start + filters.limit);
    const next = start + items.length;
    const projected = items.map(projectDefinition);
    const body: Record<string, unknown> = { ...identity(generation), items: projected };
    if (next < filtered.length)
      body.nextCursor = yield* projectionAttempt(() =>
        encodeCursor(
          { ...expected, position: next },
          cursorSecret(jobs?.cursorSecret, generation.graphHash),
        ),
      );
    const safe = safeJson(body);
    return isRecord(safe) ? ({ ...safe, items: projected } as JsonValue) : safe;
  },
  (effect) => observeExecution("inspector", "listJobDefinitions", effect),
);

/**
 * Reads task-backed job declarations and bounded native health evidence.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @param jobs - Optional native job authorities and read policy.
 * @returns A bounded definition page with a signed continuation cursor.
 */
export function listJobDefinitions(
  generation: ResolvedActiveGeneration,
  request: Request,
  jobs?: InspectorJobsServices,
): Promise<JsonValue> {
  return runExecutionPromise(
    inspectorExecution,
    listJobDefinitionsEffect(generation, request, jobs),
  );
}

/**
 * Selects one task-backed job declaration using its existing identity aliases.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param id - Declaration or native record identifier selected by the caller.
 * @param jobs - Optional native job authorities and read policy.
 * @returns A lazy observed Effect containing a public job definition or existing not-found failure.
 */
export const getJobDefinitionEffect = Effect.fn("Inspector.getJobDefinition")(
  function* (generation: ResolvedActiveGeneration, id: string, jobs?: InspectorJobsServices) {
    const item = definitions(generation, yield* serviceHealthEffect(jobs)).find(
      (value) => value.id === id || value.jobId === id || value.name === id,
    );
    if (item === undefined)
      return yield* Effect.fail(new InspectorJobsError("RELKIT_INSPECTOR_JOBS_NOT_FOUND", 404));
    const definition = projectDefinition(item);
    const response = safeJson({ ...identity(generation), definition });
    return isRecord(response) ? ({ ...response, definition } as JsonValue) : response;
  },
  (effect) => observeExecution("inspector", "getJobDefinition", effect),
);

/**
 * Selects one task-backed job declaration using its existing identity aliases.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param id - Declaration or native record identifier selected by the caller.
 * @param jobs - Optional native job authorities and read policy.
 * @returns A public job definition or existing not-found failure.
 */
export function getJobDefinition(
  generation: ResolvedActiveGeneration,
  id: string,
  jobs?: InspectorJobsServices,
): Promise<JsonValue> {
  return runExecutionPromise(inspectorExecution, getJobDefinitionEffect(generation, id, jobs));
}

/**
 * Projects one task declaration with its public versions and lifecycle metadata.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns The existing public task-definition envelope.
 */
function getTaskDefinitionValue(generation: ResolvedActiveGeneration, id: string): JsonValue {
  const nodes = graphNodes(generation).filter((node) => node.kind === "task");
  const node = nodes.find((value) => value.id === id || value.taskId === id);
  if (node === undefined) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_NOT_FOUND", 404);
  // Redact stored descriptors before spreading; private accessors must never execute.
  const stored = safeJson(node);
  const hooks = pick(node, ["onStart", "onSuccess", "onFailure"]);
  const version = pick(node, ["version"]).version;
  const task = safeJson({
    ...(isRecord(stored) ? stored : {}),
    versions: typeof version === "string" ? [version] : [],
    lifecycleHooks: hooks,
  });
  return safeJson({ ...identity(generation), task });
}

/**
 * Projects one task declaration under its own observed operation.
 * @param generation - Authorized generation containing stored task declarations.
 * @param id - Existing task declaration or task identifier.
 * @returns Lazy public task JSON or the existing typed not-found failure.
 */
export const getTaskDefinitionEffect = Effect.fn("InspectorJobs.taskDefinition")(
  (generation: ResolvedActiveGeneration, id: string) =>
    projectionAttempt(() => getTaskDefinitionValue(generation, id)),
  (effect) => observeExecution("inspector", "jobs.task-definition", effect),
);

/**
 * Runs task projection on the reused synchronous compatibility owner.
 * @param generation - Authorized generation containing stored task declarations.
 * @param id - Existing task declaration or task identifier.
 * @returns The existing public task-definition response.
 */
export function getTaskDefinition(generation: ResolvedActiveGeneration, id: string): JsonValue {
  return runInspectorSync(inspectorExecution, getTaskDefinitionEffect(generation, id));
}

/**
 * Projects declaration-only job records without querying native runtimes.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns Stable public job definitions with unknown health.
 */
export function definitionRecords(
  generation: ResolvedActiveGeneration,
): readonly JobDefinitionRecord[] {
  return definitions(generation);
}
