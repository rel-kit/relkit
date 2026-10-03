import type { TaskJobNode } from "@relkit/graph";
import { createJobsControls } from "@relkit/jobs";
import { Effect } from "effect";
import { httpBoundary } from "../http-effect.js";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { assertGrantLive, authorizeJobOperation } from "./authorization.js";
import { configFor, envelopeInput, guardJobRequest, requiredText } from "./common.js";
import { readRun } from "./handlers-validation.js";
import { projectRetry } from "./projection.js";
import {
  assertRunForJob,
  descriptorFor,
  runtimeFor,
  scopedRuntime,
  trustedScopeFor,
} from "./support.js";

/** Authorizes a failed run and submits the declared retry request.
 * @param options - Compiled route plan, manifest and jobs runtime configuration.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Untrusted request envelope for this job operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns The validated retry receipt matching the declared job and task version.
 */
export const retryJobRunEffect = Effect.fn("JobsMutations.retryJobRun")(function* (
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
) {
  const input = envelopeInput(value, ["runId", "operationId", "expectedIdentity"]);
  yield* httpBoundary("jobs.retryJobRun", () => guardJobRequest(options, context, input, "retry"));
  const config = configFor(options);
  const descriptor = yield* httpBoundary("jobs.retryJobRun", () => descriptorFor(config, job));
  const runtime = yield* httpBoundary("jobs.retryJobRun", () => runtimeFor(config, job));
  const runId = requiredText(input.runId, "run ID");
  const operationId = requiredText(input.operationId, "operation ID");
  const trusted = yield* httpBoundary("jobs.retryJobRun", () =>
    trustedScopeFor(config, context, job, "retry"),
  );
  const initial = yield* httpBoundary("jobs.retryJobRun", () =>
    authorizeJobOperation(
      config,
      context,
      job,
      descriptor,
      "retry",
      undefined,
      undefined,
      signal,
      runId,
    ),
  );
  const observed = yield* httpBoundary("jobs.retryJobRun", () =>
    readRun(runtime, initial.grant.scope, runId, signal),
  );
  const authorized = yield* httpBoundary("jobs.retryJobRun", () =>
    authorizeJobOperation(
      config,
      context,
      job,
      descriptor,
      "retry",
      undefined,
      observed,
      signal,
      runId,
    ),
  );
  assertRunForJob(observed, job, { ...trusted, scope: authorized.grant.scope });
  assertGrantLive(authorized.grant);
  const receipt = yield* httpBoundary("jobs.retryJobRun", () =>
    createJobsControls(scopedRuntime(runtime, authorized.grant.scope)).retry(runId, {
      operationId,
      ...(signal === undefined ? {} : { signal }),
    }),
  );
  return projectRetry(receipt, job);
});
