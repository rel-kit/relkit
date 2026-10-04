import type { JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise } from "../native-edge.js";
import { aggregateRunsEffect } from "./run-aggregate.js";
import { inspectorNativeJobsExecution } from "./native.service.js";
import { nativeAttempt, projectionAttempt, unwrapInspectorFailure } from "../native-edge.js";
import { assertFilterSupport, parseRunFilters } from "./filters.js";
import { authorizeJobs, jobBindings, operationContext } from "./services.js";
import { InspectorJobsError } from "./types.js";
import { identity, safeJson, isRecord, type ResolvedActiveGeneration } from "../shared.js";

/**
 * Lazily authorizes, validates and aggregates native run pages.
 * @param generation - Resolved generation with native job authorities.
 * @param request - HTTP query and native cancellation signal.
 * @returns Public JSON requiring InspectorNativeJobs, with fatal cursor errors preserved.
 */
export const listJobRunsEffect = Effect.fn("InspectorJobs.listRuns")(
  function* (generation: ResolvedActiveGeneration, request: Request) {
    yield* nativeAttempt(() =>
      authorizeJobs(
        generation,
        request,
        "read",
        new URL(request.url).searchParams.get("service") ?? undefined,
      ),
    );
    const resolved = yield* projectionAttempt(() =>
      resolveJobName(generation, parseRunFilters(request)),
    );
    const bindings = yield* nativeAttempt(() => jobBindings(generation));
    yield* projectionAttempt(() => {
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
    });
    return yield* aggregateRunsEffect(
      generation,
      request,
      resolved,
      new URL(request.url).searchParams.get("cursor"),
    );
  },
  (effect) => observeExecution("inspector", "jobs.list-runs", effect),
);

/**
 * Lists native runs using the reused compatibility owner.
 * @param generation - Authorized active generation.
 * @param request - Run filters, cursor and cancellation signal.
 * @returns The native aggregate page or the original public query error.
 */
export function listJobRuns(
  generation: ResolvedActiveGeneration,
  request: Request,
): Promise<JsonValue> {
  return runExecutionPromise(inspectorNativeJobsExecution, listJobRunsEffect(generation, request));
}

/**
 * Lazily searches native authorities in declaration order, stopping at the first run.
 * @param generation - Active native-job generation.
 * @param request - Optional service selector and cancellation signal.
 * @param runId - Requested native run identity.
 * @returns Redacted detail; all-unavailable and not-found remain distinct failures.
 */
export const getJobRunEffect = Effect.fn("InspectorJobs.getRun")(
  function* (generation: ResolvedActiveGeneration, request: Request, runId: string) {
    const service = new URL(request.url).searchParams.get("service") ?? undefined;
    yield* nativeAttempt(() => authorizeJobs(generation, request, "read", service));
    const bindings = yield* nativeAttempt(() => jobBindings(generation));
    const selected =
      service === undefined ? bindings : bindings.filter((binding) => binding.service === service);
    if (selected.length === 0)
      return yield* Effect.fail(new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503));
    let unavailable = 0;
    // Later reads depend on whether an earlier authority found the run; traversal is sequential.
    for (const binding of selected) {
      const result = yield* nativeAttempt(() =>
        binding.get(runId, operationContext(generation, binding, "read", request)),
      ).pipe(
        Effect.match({
          onSuccess: (run) => ({ success: true as const, run }),
          onFailure: (error) => ({ success: false as const, error }),
        }),
      );
      if (!result.success) {
        if (isUnavailable(result.error)) unavailable += 1;
        continue;
      }
      return yield* projectionAttempt(() => {
        const run = result.run;
        const safeRun = safeJson(run);
        const evidence = {
          source: "jobs-service",
          observedAt: run.observedAt,
          live: binding.observe === undefined ? "unavailable" : "available",
        };
        const projectedRun = isRecord(safeRun)
          ? { ...safeRun, service: binding.service, serviceGeneration: binding.serviceGeneration }
          : safeRun;
        const response = safeJson({ ...identity(generation), run: projectedRun, evidence });
        return isRecord(response)
          ? ({
              ...response,
              service: binding.service,
              serviceGeneration: binding.serviceGeneration,
              evidence,
              run: projectedRun,
            } as JsonValue)
          : response;
      });
    }
    return yield* Effect.fail(
      new InspectorJobsError(
        unavailable === selected.length
          ? "RELKIT_INSPECTOR_JOBS_UNAVAILABLE"
          : "RELKIT_INSPECTOR_JOBS_NOT_FOUND",
        unavailable === selected.length ? 503 : 404,
      ),
    );
  },
  (effect) => observeExecution("inspector", "jobs.get-run", effect),
);

/**
 * Reads one native run using the finite compatibility owner.
 * @param generation - Authorized generation.
 * @param request - Service selector and native cancellation signal.
 * @param runId - Native run identity.
 * @returns Redacted run detail or the existing unavailable/not-found error.
 */
export function getJobRun(
  generation: ResolvedActiveGeneration,
  request: Request,
  runId: string,
): Promise<JsonValue> {
  return runExecutionPromise(
    inspectorNativeJobsExecution,
    getJobRunEffect(generation, request, runId),
  );
}

/**
 * Resolves a human job name without traversing private graph properties.
 * @param generation - Resolved graph generation.
 * @param filters - Validated native run filters.
 * @returns Filters with a unique job identity; ambiguity throws the existing filter error.
 */
function resolveJobName(
  generation: ResolvedActiveGeneration,
  filters: ReturnType<typeof parseRunFilters>,
): ReturnType<typeof parseRunFilters> {
  if (filters.jobName === undefined || filters.jobId !== undefined) return filters;
  const graph = generation.graph;
  const nodes = isRecord(graph) && Array.isArray(graph.nodes) ? graph.nodes.filter(isRecord) : [];
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

/**
 * Recognizes only established native unavailability codes.
 * @param error - Native failure value.
 * @returns Whether the native authority is unavailable rather than missing the run.
 */
function isUnavailable(error: unknown): boolean {
  error = unwrapInspectorFailure(error);
  return (
    isRecord(error) &&
    (error.code === "SERVICE_UNAVAILABLE" ||
      error.code === "RELKIT_JOBS_SERVICE_UNAVAILABLE" ||
      error.code === "UNAVAILABLE")
  );
}
