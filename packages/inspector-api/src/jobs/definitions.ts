import type { JsonValue } from "@relkit/contracts";
import { cursorSecret, decodeCursor, encodeCursor, type InspectorCursor } from "./filters.js";
import { InspectorJobsError, type InspectorJobsServices } from "./types.js";
import { identity, isRecord, safeJson, type ResolvedActiveGeneration } from "../shared.js";
import {
  definitionLimit,
  definitions,
  filtersJson,
  graphNodes,
  matches,
  projectDefinition,
  readPosition,
  serviceHealth,
  text,
} from "./definitions-support.js";

export interface JobDefinitionRecord {
  readonly id: string;
  readonly name: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId?: string;
  readonly service: string;
  readonly serviceGeneration?: string;
  readonly implicit: boolean;
  readonly default: boolean;
  readonly execution: string;
  readonly schema?: JsonValue;
  readonly contextDependencies?: JsonValue;
  readonly policy?: JsonValue;
  readonly resources?: JsonValue;
  readonly hooks?: JsonValue;
  readonly capabilities?: JsonValue;
  readonly schedules?: JsonValue;
  readonly worker: JsonValue;
  readonly health: string;
  readonly retired: boolean;
  readonly source?: JsonValue;
}

export async function listJobDefinitions(
  generation: ResolvedActiveGeneration,
  request: Request,
  jobs?: InspectorJobsServices,
): Promise<JsonValue> {
  const params = new URL(request.url).searchParams;
  const filters = {
    search: text(params.get("search")),
    job: text(params.get("job")),
    task: text(params.get("task")),
    service: text(params.get("service")),
    limit: definitionLimit(params.get("limit")),
  };
  const all = definitions(generation, await serviceHealth(jobs));
  const filtered = all.filter((item) => matches(item, filters));
  const cursorValue = params.get("cursor");
  const expected = {
    kind: "definitions" as const,
    generationId: generation.generationId,
    graphHash: generation.graphHash,
    filters: filtersJson(filters),
  };
  const position =
    cursorValue === null
      ? 0
      : decodeCursor(cursorValue, expected, cursorSecret(jobs?.cursorSecret, generation.graphHash))
          .position;
  const start = readPosition(position);
  const items = filtered.slice(start, start + filters.limit);
  const next = start + items.length;
  const projected = items.map(projectDefinition);
  const body: Record<string, unknown> = { ...identity(generation), items: projected };
  if (next < filtered.length)
    body.nextCursor = encodeCursor(
      { ...expected, position: next },
      cursorSecret(jobs?.cursorSecret, generation.graphHash),
    );
  const safe = safeJson(body);
  return isRecord(safe) ? ({ ...safe, items: projected } as JsonValue) : safe;
}

export async function getJobDefinition(
  generation: ResolvedActiveGeneration,
  id: string,
  jobs?: InspectorJobsServices,
): Promise<JsonValue> {
  const item = definitions(generation, await serviceHealth(jobs)).find(
    (value) => value.id === id || value.jobId === id || value.name === id,
  );
  if (item === undefined) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_NOT_FOUND", 404);
  const definition = projectDefinition(item);
  const response = safeJson({ ...identity(generation), definition });
  return isRecord(response) ? ({ ...response, definition } as JsonValue) : response;
}

export function getTaskDefinition(generation: ResolvedActiveGeneration, id: string): JsonValue {
  const nodes = graphNodes(generation).filter((node) => node.kind === "task");
  const node = nodes.find((value) => value.id === id || value.taskId === id);
  if (node === undefined) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_NOT_FOUND", 404);
  const task = safeJson({
    ...node,
    versions: typeof node.version === "string" ? [node.version] : [],
    lifecycleHooks: { onStart: node.onStart, onSuccess: node.onSuccess, onFailure: node.onFailure },
  });
  return safeJson({ ...identity(generation), task });
}

export function definitionRecords(
  generation: ResolvedActiveGeneration,
): readonly JobDefinitionRecord[] {
  return definitions(generation);
}
