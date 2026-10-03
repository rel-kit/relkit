import type { TaskJobNode } from "@relkit/graph";
import { createJobsControls } from "@relkit/jobs";
import { Effect } from "effect";
import { httpBoundary, HttpBoundaryError } from "../http-effect.js";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { assertGrantLive, authorizeJobOperation } from "./authorization.js";
import { configFor, envelopeInput, guardJobRequest, requiredText } from "./common.js";
import { readRun, validateCanonicalRun } from "./handlers-validation.js";
import { projectCancellation } from "./projection.js";
import {
  assertRunForJob,
  descriptorFor,
  jobError,
  runtimeFor,
  scopedRuntime,
  trustedScopeFor,
} from "./support.js";
import { jobPolicy } from "./types.js";

/** Authorizes the current run and records a cancellation request.
 * @param options - Compiled route plan, manifest and jobs runtime configuration.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Untrusted request envelope for this job operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns The cancellation receipt with any attached run projected to public fields.
 */
export const cancelJobRunEffect = Effect.fn("JobsMutations.cancelJobRun")(function* (
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
) {
  const input = envelopeInput(value, ["runId", "operationId", "reason", "expectedIdentity"]);
  yield* httpBoundary("jobs.cancelJobRun", () =>
    guardJobRequest(options, context, input, "cancel"),
  );
  const config = configFor(options);
  const descriptor = yield* httpBoundary("jobs.cancelJobRun", () => descriptorFor(config, job));
  const runtime = yield* httpBoundary("jobs.cancelJobRun", () => runtimeFor(config, job));
  const runId = requiredText(input.runId, "run ID");
  const operationId = requiredText(input.operationId, "operation ID");
  const trusted = yield* httpBoundary("jobs.cancelJobRun", () =>
    trustedScopeFor(config, context, job, "cancel"),
  );
  const initial = yield* httpBoundary("jobs.cancelJobRun", () =>
    authorizeJobOperation(
      config,
      context,
      job,
      descriptor,
      "cancel",
      undefined,
      undefined,
      signal,
      runId,
    ),
  );
  const observed = yield* httpBoundary("jobs.cancelJobRun", () =>
    readRun(runtime, initial.grant.scope, runId, signal),
  );
  const authorized = yield* httpBoundary("jobs.cancelJobRun", () =>
    authorizeJobOperation(
      config,
      context,
      job,
      descriptor,
      "cancel",
      undefined,
      observed,
      signal,
      runId,
    ),
  );
  assertRunForJob(observed, job, { ...trusted, scope: authorized.grant.scope });
  assertGrantLive(authorized.grant);
  const receipt = yield* httpBoundary("jobs.cancelJobRun", () =>
    createJobsControls(scopedRuntime(runtime, authorized.grant.scope)).cancel(runId, {
      operationId,
      ...(input.reason === undefined ? {} : { reason: requiredText(input.reason, "reason") }),
      ...(signal === undefined ? {} : { signal }),
    }),
  );
  if (receipt.run !== undefined) {
    const run = receipt.run;
    if (receipt.run.runId !== runId)
      return yield* Effect.fail(
        new HttpBoundaryError({
          operation: "jobs.cancelJobRun",
          cause: jobError("RELKIT_JOB_ACCESS_DENIED", "Job cancellation receipt is unavailable."),
        }),
      );
    assertRunForJob(receipt.run, job, { ...trusted, scope: authorized.grant.scope });
    yield* httpBoundary("jobs.cancelJobRun", () => validateCanonicalRun(descriptor, run));
  }
  return projectCancellation(receipt, jobPolicy(job), descriptor);
});
