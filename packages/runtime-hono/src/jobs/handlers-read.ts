import { assertJsonValue, type JsonValue } from "@relkit/contracts";
import type { RunListQuery, RunPage, RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import { createJobsControls } from "@relkit/jobs";
import type { TaskJobNode } from "@relkit/graph";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { authorizeJobOperation, assertGrantLive } from "./authorization.js";
import {
  configFor,
  envelopeInput,
  guardJobRequest,
  optionalCursor,
  recordInput,
  requiredText,
} from "./common.js";
import {
  decodeJobCursor,
  encodeJobCursor,
  projectPageCursor,
  projectWatchCursor,
} from "./cursors.js";
import {
  assertRunForJob,
  descriptorFor,
  runtimeFor,
  scopedRuntime,
  trustedScopeFor,
} from "./support.js";
import { jobPolicy } from "./types.js";
import { projectPage, projectSnapshot, projectWatchFrame } from "./projection.js";
import { queryInput, readRun, validateCanonicalRun } from "./handlers-validation.js";

export async function getJobRun(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<RunSnapshot> {
  const input = envelopeInput(value, ["runId", "expectedIdentity"]);
  await guardJobRequest(options, context, input, "get");
  const config = configFor(options);
  const descriptor = await descriptorFor(config, job);
  const runtime = await runtimeFor(config, job);
  const runId = requiredText(input.runId, "run ID");
  const trusted = await trustedScopeFor(config, context, job, "get");
  const initial = await authorizeJobOperation(
    config,
    context,
    job,
    descriptor,
    "get",
    undefined,
    undefined,
    signal,
    runId,
  );
  const observed = await readRun(runtime, initial.grant.scope, runId, signal);
  const authorized = await authorizeJobOperation(
    config,
    context,
    job,
    descriptor,
    "get",
    undefined,
    observed,
    signal,
    runId,
  );
  const owner = { ...trusted, scope: authorized.grant.scope };
  assertRunForJob(observed, job, owner);
  await validateCanonicalRun(descriptor, observed);
  return projectSnapshot(observed, jobPolicy(job), descriptor);
}

export async function listJobRuns(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<RunPage<RunSnapshot>> {
  const input = envelopeInput(value, ["query", "expectedIdentity"]);
  await guardJobRequest(options, context, input, "list");
  const config = configFor(options);
  const descriptor = await descriptorFor(config, job);
  const runtime = await runtimeFor(config, job);
  const trusted = await trustedScopeFor(config, context, job, "list");
  const authorized = await authorizeJobOperation(
    config,
    context,
    job,
    descriptor,
    "list",
    undefined,
    undefined,
    signal,
  );
  const requestedQuery = queryInput(input.query);
  const { cursor: requestedCursor, ...requestedFilters } = requestedQuery;
  const filters = { ...requestedFilters, jobId: job.jobId };
  assertJsonValue(filters);
  const owner = { ...trusted, scope: authorized.grant.scope };
  const cursor = decodeJobCursor(config, owner, job, "list", filters, requestedCursor);
  const page = await createJobsControls(scopedRuntime(runtime, authorized.grant.scope)).list(
    { ...filters, ...(cursor === undefined ? {} : { cursor }) },
    signal === undefined ? {} : { signal },
  );
  assertGrantLive(authorized.grant);
  for (const run of page.items) {
    assertRunForJob(run, job, owner);
    await validateCanonicalRun(descriptor, run);
  }
  return projectPageCursor(
    projectPage(page, jobPolicy(job), descriptor),
    config,
    owner,
    job,
    filters,
  );
}

export async function watchJobRun(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<AsyncIterable<RunWatchFrame<RunSnapshot>>> {
  const input = envelopeInput(value, ["runId", "after", "expectedIdentity"]);
  await guardJobRequest(options, context, input, "watch");
  const config = configFor(options);
  const descriptor = await descriptorFor(config, job);
  const runtime = await runtimeFor(config, job);
  const runId = requiredText(input.runId, "run ID");
  const trusted = await trustedScopeFor(config, context, job, "watch");
  const authorized = await authorizeJobOperation(
    config,
    context,
    job,
    descriptor,
    "watch",
    undefined,
    undefined,
    signal,
    runId,
  );
  const owner = { ...trusted, scope: authorized.grant.scope };
  const filters = { runId } as JsonValue;
  const after = decodeJobCursor(
    config,
    owner,
    job,
    "watch",
    filters,
    optionalCursor(input.after, "cursor"),
  );
  const source = createJobsControls(scopedRuntime(runtime, owner.scope)).observe(
    { runId, ...(after === undefined ? {} : { after }) },
    signal === undefined ? {} : { signal },
  );
  return (async function* () {
    for await (const frame of source) {
      assertGrantLive(authorized.grant);
      assertRunForJob(frame.run, job, owner);
      await validateCanonicalRun(descriptor, frame.run);
      yield projectWatchCursor(
        projectWatchFrame(frame, jobPolicy(job), descriptor),
        config,
        owner,
        job,
        filters,
      );
    }
  })();
}
