import type { RunCancellationReceipt, RunHandle, RunRetryReceipt } from "@relkit/contracts/jobs";
import type { TaskJobNode } from "@relkit/graph";
import { Context, Effect, Layer } from "effect";
import { observeHttp, runHttp } from "../http-effect.js";
import type { RouteMaterializationOptions } from "../materialize-routes.js";
import type { RpcContext } from "../rpc.js";
import { cancelJobRunEffect } from "./handlers-mutations-cancel.js";
import { retryJobRunEffect } from "./handlers-mutations-retry.js";
import { triggerJobEffect } from "./handlers-mutations-trigger.js";
import type { JobsMutationOperations } from "./handlers-mutations.types.js";

/** Invoke the trigger job service through its native Promise boundary.
 * @param options - Compiled route plan, manifest and jobs runtime configuration.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Untrusted request envelope for this job operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns The accepted run handle after scoped authorization and submission.
 */
export function triggerJob(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<RunHandle> {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* JobsMutations;
      return yield* service.triggerJob(options, context, job, value, signal);
    }).pipe(Effect.provide(JobsMutationsLive)),
  );
}

/** Invoke the cancel job run service through its native Promise boundary.
 * @param options - Compiled route plan, manifest and jobs runtime configuration.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Untrusted request envelope for this job operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns The cancellation receipt with any attached run projected to public fields.
 */
export function cancelJobRun(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<RunCancellationReceipt> {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* JobsMutations;
      return yield* service.cancelJobRun(options, context, job, value, signal);
    }).pipe(Effect.provide(JobsMutationsLive)),
  );
}

/** Invoke the retry job run service through its native Promise boundary.
 * @param options - Compiled route plan, manifest and jobs runtime configuration.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param value - Untrusted request envelope for this job operation.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @returns The validated retry receipt matching the declared job and task version.
 */
export function retryJobRun(
  options: RouteMaterializationOptions,
  context: RpcContext,
  job: TaskJobNode,
  value: unknown,
  signal?: AbortSignal,
): Promise<RunRetryReceipt> {
  return runHttp(
    Effect.gen(function* () {
      const service = yield* JobsMutations;
      return yield* service.retryJobRun(options, context, job, value, signal);
    }).pipe(Effect.provide(JobsMutationsLive)),
  );
}

/** Durable submission, cancellation and retry authority with scoped authorization. */
export class JobsMutations extends Context.Service<JobsMutations, JobsMutationOperations>()(
  "@relkit/runtime-hono/JobsMutations",
) {}

/** Live mutation workflows with one operation observation per service call. */
export const JobsMutationsLive = Layer.succeed(JobsMutations, {
  triggerJob: (...args) => observeHttp("jobs.triggerJob", triggerJobEffect(...args)),
  cancelJobRun: (...args) => observeHttp("jobs.cancelJobRun", cancelJobRunEffect(...args)),
  retryJobRun: (...args) => observeHttp("jobs.retryJobRun", retryJobRunEffect(...args)),
});
