import type { TaskJobNode } from "@relkit/graph";
import { Effect } from "effect";
import { httpBoundary } from "../http-effect.js";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { authorizeJobOperation } from "./authorization.js";
import { configFor, envelopeInput, guardJobRequest, requiredText } from "./common.js";
import { readRun, validateCanonicalRun } from "./handlers-validation.js";
import { projectSnapshot } from "./projection.js";
import { assertRunForJob, descriptorFor, runtimeFor, trustedScopeFor } from "./support.js";
import { jobPolicy } from "./types.js";

/** Reads a run using admission and post-read authorization before public projection.
 * @param options - Compiled route plan, manifest and jobs runtime configuration.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Untrusted request envelope for this job operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns A validated, authorized run snapshot restricted to public fields.
 */
export const getJobRunEffect = Effect.fn("JobsReads.getJobRun")(function* (
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
) {
  const input = envelopeInput(value, ["runId", "expectedIdentity"]);
  yield* httpBoundary("jobs.getJobRun", () => guardJobRequest(options, context, input, "get"));
  const config = configFor(options);
  const descriptor = yield* httpBoundary("jobs.getJobRun", () => descriptorFor(config, job));
  const runtime = yield* httpBoundary("jobs.getJobRun", () => runtimeFor(config, job));
  const runId = requiredText(input.runId, "run ID");
  const trusted = yield* httpBoundary("jobs.getJobRun", () =>
    trustedScopeFor(config, context, job, "get"),
  );
  const initial = yield* httpBoundary("jobs.getJobRun", () =>
    authorizeJobOperation(
      config,
      context,
      job,
      descriptor,
      "get",
      undefined,
      undefined,
      signal,
      runId,
    ),
  );
  const observed = yield* httpBoundary("jobs.getJobRun", () =>
    readRun(runtime, initial.grant.scope, runId, signal),
  );
  const authorized = yield* httpBoundary("jobs.getJobRun", () =>
    authorizeJobOperation(
      config,
      context,
      job,
      descriptor,
      "get",
      undefined,
      observed,
      signal,
      runId,
    ),
  );
  const owner = { ...trusted, scope: authorized.grant.scope };
  assertRunForJob(observed, job, owner);
  yield* httpBoundary("jobs.getJobRun", () => validateCanonicalRun(descriptor, observed));
  return projectSnapshot(observed, jobPolicy(job), descriptor);
});
