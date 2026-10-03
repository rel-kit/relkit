import type { RunPage, RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import type { TaskJobNode } from "@relkit/graph";
import { Context, Effect, Layer } from "effect";
import { observeHttp, runHttp } from "../http-effect.js";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { getJobRunEffect } from "./handlers-read-get.js";
import { listJobRunsEffect } from "./handlers-read-list.js";
import { watchJobRunEffect } from "./handlers-read-watch.js";
import type { JobsReadOperations } from "./handlers-read.types.js";

/** Invoke the get job run service through its native Promise boundary.
 * @param options - Compiled route plan, manifest and jobs runtime configuration.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Untrusted request envelope for this job operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns A validated, authorized run snapshot restricted to public fields.
 */
export function getJobRun(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<RunSnapshot> {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* JobsReads;
      return yield* service.getJobRun(options, context, job, value, signal);
    }).pipe(Effect.provide(JobsReadsLive)),
  );
}

/** Invoke the list job runs service through its native Promise boundary.
 * @param options - Compiled route plan, manifest and jobs runtime configuration.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Untrusted request envelope for this job operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns A projected page with a scope-bound public continuation cursor.
 */
export function listJobRuns(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<RunPage<RunSnapshot>> {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* JobsReads;
      return yield* service.listJobRuns(options, context, job, value, signal);
    }).pipe(Effect.provide(JobsReadsLive)),
  );
}

/** Invoke the watch job run service through its native Promise boundary.
 * @param options - Compiled route plan, manifest and jobs runtime configuration.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Untrusted request envelope for this job operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns A lazy iterable that validates grant lifetime and projects every observed run.
 */
export function watchJobRun(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<AsyncIterable<RunWatchFrame<RunSnapshot>>> {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* JobsReads;
      return yield* service.watchJobRun(options, context, job, value, signal);
    }).pipe(Effect.provide(JobsReadsLive)),
  );
}

/** Run lookup, listing and observation authority with per-request authorization. */
export class JobsReads extends Context.Service<JobsReads, JobsReadOperations>()(
  "@relkit/runtime-hono/JobsReads",
) {}

/** Live read workflows with one operation observation per service call. */
export const JobsReadsLive = Layer.succeed(JobsReads, {
  getJobRun: (...args) => observeHttp("jobs.getJobRun", getJobRunEffect(...args)),
  listJobRuns: (...args) => observeHttp("jobs.listJobRuns", listJobRunsEffect(...args)),
  watchJobRun: (...args) => observeHttp("jobs.watchJobRun", watchJobRunEffect(...args)),
});
