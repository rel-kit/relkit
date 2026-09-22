import type { JsonValue } from "@relkit/contracts";
import { aggregateRuns } from "./run-aggregate.js";
import { assertFilterSupport, parseRunFilters } from "./filters.js";
import { authorizeJobs, jobBindings, operationContext } from "./services.js";
import { InspectorJobsError } from "./types.js";
import { identity, safeJson, type ResolvedActiveGeneration } from "../shared.js";

export async function listJobRuns(
  generation: ResolvedActiveGeneration,
  request: Request,
): Promise<JsonValue> {
  await authorizeJobs(
    generation,
    request,
    "read",
    new URL(request.url).searchParams.get("service") ?? undefined,
  );
  const filters = parseRunFilters(request);
  const resolved = resolveJobName(generation, filters);
  const bindings = await jobBindings(generation);
  const selected =
    resolved.service === undefined
      ? bindings
      : bindings.filter((binding) => binding.service === resolved.service);
  if (selected.length === 0)
    throw new InspectorJobsError(
      "RELKIT_INSPECTOR_JOBS_UNAVAILABLE",
      503,
      "requested jobs service is unavailable",
    );
  for (const binding of selected) assertFilterSupport(binding, resolved);
  const cursor = new URL(request.url).searchParams.get("cursor");
  return aggregateRuns(generation, request, resolved, cursor);
}

export async function getJobRun(
  generation: ResolvedActiveGeneration,
  request: Request,
  runId: string,
): Promise<JsonValue> {
  await authorizeJobs(
    generation,
    request,
    "read",
    new URL(request.url).searchParams.get("service") ?? undefined,
  );
  const bindings = await jobBindings(generation);
  const service = new URL(request.url).searchParams.get("service") ?? undefined;
  const selected =
    service === undefined ? bindings : bindings.filter((binding) => binding.service === service);
  if (selected.length === 0) throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503);
  let unavailable = 0;
  for (const binding of selected) {
    try {
      const run = await binding.get(runId, operationContext(generation, binding, "read", request));
      const safeRun = safeJson(run);
      const evidence = {
        source: "jobs-service",
        observedAt: run.observedAt,
        live: binding.observe === undefined ? "unavailable" : "available",
      };
      const response = safeJson({
        ...identity(generation),
        run: isRecord(safeRun)
          ? { ...safeRun, service: binding.service, serviceGeneration: binding.serviceGeneration }
          : safeRun,
        evidence,
      });
      return isRecord(response)
        ? ({
            ...response,
            service: binding.service,
            serviceGeneration: binding.serviceGeneration,
            evidence,
            run: isRecord(safeRun)
              ? {
                  ...safeRun,
                  service: binding.service,
                  serviceGeneration: binding.serviceGeneration,
                }
              : safeRun,
          } as JsonValue)
        : response;
    } catch (error) {
      if (isUnavailable(error)) unavailable += 1;
    }
  }
  if (unavailable === selected.length)
    throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503);
  throw new InspectorJobsError("RELKIT_INSPECTOR_JOBS_NOT_FOUND", 404);
}

function resolveJobName(
  generation: ResolvedActiveGeneration,
  filters: ReturnType<typeof parseRunFilters>,
): ReturnType<typeof parseRunFilters> {
  if (filters.jobName === undefined || filters.jobId !== undefined) return filters;
  const nodes = graphNodes(generation);
  const matches = nodes.filter(
    (node) =>
      node.kind === "job" && node.executionModel === "task" && node.name === filters.jobName,
  );
  if (matches.length > 1)
    throw new InspectorJobsError(
      "RELKIT_INSPECTOR_JOBS_FILTER_INVALID",
      400,
      "job name is ambiguous",
    );
  if (matches.length === 0) return { ...filters, jobId: "__relkit_missing_job__" };
  const match = matches[0]!;
  return { ...filters, jobId: String(match.jobId ?? match.id) };
}

function graphNodes(generation: ResolvedActiveGeneration): Record<string, unknown>[] {
  const graph = generation.graph;
  if (!isRecord(graph) || !Array.isArray(graph.nodes)) return [];
  return graph.nodes.filter(isRecord);
}
function isUnavailable(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return (
    error.code === "SERVICE_UNAVAILABLE" ||
    error.code === "RELKIT_JOBS_SERVICE_UNAVAILABLE" ||
    error.code === "UNAVAILABLE"
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
