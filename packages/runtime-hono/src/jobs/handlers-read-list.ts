import { assertJsonValue } from "@relkit/contracts";
import type { TaskJobNode } from "@relkit/graph";
import { createJobsControls } from "@relkit/jobs";
import { Effect } from "effect";
import { httpBoundary } from "../http-effect.js";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { assertGrantLive, authorizeJobOperation } from "./authorization.js";
import { configFor, envelopeInput, guardJobRequest } from "./common.js";
import { decodeJobCursor, projectPageCursor } from "./cursors.js";
import { queryInput, validateCanonicalRun } from "./handlers-validation.js";
import { projectPage } from "./projection.js";
import {
  assertRunForJob,
  descriptorFor,
  runtimeFor,
  scopedRuntime,
  trustedScopeFor,
} from "./support.js";
import { jobPolicy } from "./types.js";

/** Lists scoped runs and validates every returned run before projecting the page.
 * @param options - Compiled route plan, manifest and jobs runtime configuration.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Untrusted request envelope for this job operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns A projected page with a scope-bound public continuation cursor.
 */
export const listJobRunsEffect = Effect.fn("JobsReads.listJobRuns")(function* (
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
) {
  const input = envelopeInput(value, ["query", "expectedIdentity"]);
  yield* httpBoundary("jobs.listJobRuns", () => guardJobRequest(options, context, input, "list"));
  const config = configFor(options);
  const descriptor = yield* httpBoundary("jobs.listJobRuns", () => descriptorFor(config, job));
  const runtime = yield* httpBoundary("jobs.listJobRuns", () => runtimeFor(config, job));
  const trusted = yield* httpBoundary("jobs.listJobRuns", () =>
    trustedScopeFor(config, context, job, "list"),
  );
  const authorized = yield* httpBoundary("jobs.listJobRuns", () =>
    authorizeJobOperation(config, context, job, descriptor, "list", undefined, undefined, signal),
  );
  const requestedQuery = queryInput(input.query);
  const { cursor: requestedCursor, ...requestedFilters } = requestedQuery;
  const filters = { ...requestedFilters, jobId: job.jobId };
  assertJsonValue(filters);
  const owner = { ...trusted, scope: authorized.grant.scope };
  const cursor = decodeJobCursor(config, owner, job, "list", filters, requestedCursor);
  const page = yield* httpBoundary("jobs.listJobRuns", () =>
    createJobsControls(scopedRuntime(runtime, authorized.grant.scope)).list(
      { ...filters, ...(cursor === undefined ? {} : { cursor }) },
      signal === undefined ? {} : { signal },
    ),
  );
  assertGrantLive(authorized.grant);
  for (const run of page.items) {
    assertRunForJob(run, job, owner);
    yield* httpBoundary("jobs.listJobRuns", () => validateCanonicalRun(descriptor, run));
  }
  return projectPageCursor(
    projectPage(page, jobPolicy(job), descriptor),
    config,
    owner,
    job,
    filters,
  );
});
