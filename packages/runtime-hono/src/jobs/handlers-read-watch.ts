import type { JsonValue } from "@relkit/contracts";
import type { TaskJobNode } from "@relkit/graph";
import { createJobsControls } from "@relkit/jobs";
import { Effect, Stream } from "effect";
import { httpBoundary, HttpBoundaryError, httpIterable } from "../http-effect.js";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { assertGrantLive, authorizeJobOperation } from "./authorization.js";
import {
  configFor,
  envelopeInput,
  guardJobRequest,
  optionalCursor,
  requiredText,
} from "./common.js";
import { decodeJobCursor, projectWatchCursor } from "./cursors.js";
import { validateCanonicalRun } from "./handlers-validation.js";
import { projectWatchFrame } from "./projection.js";
import {
  assertRunForJob,
  descriptorFor,
  runtimeFor,
  scopedRuntime,
  trustedScopeFor,
} from "./support.js";
import { jobPolicy } from "./types.js";

/** Observes a scoped run with grant checks and cursor projection on every frame.
 * @param options - Compiled route plan, manifest and jobs runtime configuration.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Untrusted request envelope for this job operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns A lazy iterable that validates grant lifetime and projects every observed run.
 */
export const watchJobRunEffect = Effect.fn("JobsReads.watchJobRun")(function* (
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
) {
  const input = envelopeInput(value, ["runId", "after", "expectedIdentity"]);
  yield* httpBoundary("jobs.watchJobRun", () => guardJobRequest(options, context, input, "watch"));
  const config = configFor(options);
  const descriptor = yield* httpBoundary("jobs.watchJobRun", () => descriptorFor(config, job));
  const runtime = yield* httpBoundary("jobs.watchJobRun", () => runtimeFor(config, job));
  const runId = requiredText(input.runId, "run ID");
  const trusted = yield* httpBoundary("jobs.watchJobRun", () =>
    trustedScopeFor(config, context, job, "watch"),
  );
  const authorized = yield* httpBoundary("jobs.watchJobRun", () =>
    authorizeJobOperation(
      config,
      context,
      job,
      descriptor,
      "watch",
      undefined,
      undefined,
      signal,
      runId,
    ),
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
  return httpIterable(
    Stream.fromAsyncIterable(
      source,
      (cause) => new HttpBoundaryError({ operation: "jobs.watch.read", cause }),
    ).pipe(
      Stream.mapEffect(
        Effect.fn("JobsReads.projectWatchFrame")(function* (frame) {
          assertGrantLive(authorized.grant);
          assertRunForJob(frame.run, job, owner);
          yield* httpBoundary("jobs.watch.validate", () =>
            validateCanonicalRun(descriptor, frame.run),
          );
          return projectWatchCursor(
            projectWatchFrame(frame, jobPolicy(job), descriptor),
            config,
            owner,
            job,
            filters,
          );
        }),
      ),
    ),
  );
});
