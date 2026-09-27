import type { JobAccessGrant, JobAccessRequest } from "@relkit/contracts/jobs";
import { Effect, Result } from "effect";
import type { JobAuthorizationContext, JobDescriptorAny } from "./job.types.js";
import type { TrustedJobScope } from "./authorization.types.js";
import { JobAuthorizationError } from "./authorization-errors.js";
import { JobAuthorizationFailure } from "./authorization-failure.js";
import { assertJobGrantEffect, boundedTextEffect } from "./authorization-grant.js";
import { createJobCursor, readJobCursor } from "./authorization-cursor.js";
import { projectRunPage, projectRunSnapshot } from "./authorization-projection.js";
import { observeJobs } from "./jobs-observability.js";
export type { TrustedJobScope } from "./authorization.types.js";
export { JobAuthorizationError, JobCursorError } from "./authorization-errors.js";
export { JobAuthorizationFailure } from "./authorization-failure.js";
export {
  assertJobGrant,
  assertJobGrantEffect,
  assertAuthorizedOperation,
  assertAuthorizedOperationEffect,
} from "./authorization-grant.js";
export {
  createJobCursor,
  createJobCursorEffect,
  readJobCursor,
  readJobCursorEffect,
  JobCursorFailure,
  type JobCursorOptions,
  type JobCursorBinding,
} from "./authorization-cursor.js";
export {
  projectRunPage,
  projectRunPageEffect,
  projectRunSnapshot,
  projectRunSnapshotEffect,
} from "./authorization-projection.js";
/** Authorizes a job operation against trusted scope in Effect.
 * Policy callback failures are redacted to a tagged authorization failure.
 * @param job - Resolved job descriptor and client policy.
 * @param request - Requested client operation.
 * @param trusted - Authoritative application and tenant scope.
 * @param context - Optional complete authorization context.
 * @returns A narrowed grant or JobAuthorizationFailure.
 * @example Effect.runPromise(authorizeJobAccessEffect(job, request, trusted));
 */
export const authorizeJobAccessEffect = Effect.fn("Jobs.authorizeJobAccess")(
  function* (
    job: JobDescriptorAny,
    request: JobAccessRequest,
    trusted: TrustedJobScope,
    context?: JobAuthorizationContext,
  ) {
    const policy = yield* authorizationPreflightEffect(job, request, trusted);
    if ("public" in policy && policy.public === true)
      return Object.freeze({ scope: trusted.scope });
    const authorizationContext = context ?? {
      application: trusted.application,
      environment: trusted.environment,
      scope: trusted.scope,
    };
    const grant = yield* Effect.tryPromise({
      try: async () => await policy.authorize(request, authorizationContext),
      catch: () => new JobAuthorizationFailure({ reason: "policy" }),
    });
    yield* assertJobGrantEffect(grant, trusted);
    return Object.freeze({
      scope: grant.scope,
      ...(grant.expiresAt === undefined ? {} : { expiresAt: grant.expiresAt }),
    });
  },
  (effect) => observeJobs("authorization.authorize", effect),
);
/** Promise compatibility adapter for job authorization.
 * Preflight denials still throw synchronously before a Promise is returned.
 * @param job - Resolved job descriptor and client policy.
 * @param request - Requested client operation.
 * @param trusted - Authoritative application and tenant scope.
 * @param context - Optional complete authorization context.
 * @returns A Promise of the narrowed access grant.
 * @throws JobAuthorizationError for invalid preflight or policy decisions.
 * @example await authorizeJobAccess(job, request, trusted);
 */
export function authorizeJobAccess(
  job: JobDescriptorAny,
  request: JobAccessRequest,
  trusted: TrustedJobScope,
  context?: JobAuthorizationContext,
): Promise<JobAccessGrant> {
  const preflight = Effect.runSync(
    Effect.result(authorizationPreflightEffect(job, request, trusted)),
  );
  if (Result.isFailure(preflight)) throw new JobAuthorizationError();
  return Effect.runPromise(
    Effect.result(authorizeJobAccessEffect(job, request, trusted, context)),
  ).then((result) => {
    if (Result.isFailure(result)) throw new JobAuthorizationError();
    return result.success;
  });
}
/** Checks trusted fields and operation availability before invoking policy. */
const authorizationPreflightEffect = Effect.fn("Jobs.authorizationPreflight")(function* (
  job: JobDescriptorAny,
  request: JobAccessRequest,
  trusted: TrustedJobScope,
) {
  yield* boundedTextEffect(trusted.application);
  yield* boundedTextEffect(trusted.environment);
  yield* boundedTextEffect(trusted.scope);
  if (request.jobId !== job.id)
    return yield* Effect.fail(new JobAuthorizationFailure({ reason: "jobId" }));
  const policy = job.client;
  if (policy === undefined || !policy.operations.includes(request.operation))
    return yield* Effect.fail(new JobAuthorizationFailure({ reason: "operation" }));
  if ("public" in policy && policy.public === true) return policy;
  if (!("authorize" in policy) || typeof policy.authorize !== "function")
    return yield* Effect.fail(new JobAuthorizationFailure({ reason: "policy" }));
  return policy;
});
/** Compatibility alias for authorizeJobAccess.
 * @example await authorize(job, request, trusted);
 */
export const authorize = authorizeJobAccess;
/** Compatibility alias for projectRunSnapshot.
 * @example projectRun(snapshot, grant);
 */
export const projectRun = projectRunSnapshot;
/** Compatibility alias for createJobCursor.
 * @example createCursor(options);
 */
export const createCursor = createJobCursor;
/** Compatibility alias for readJobCursor.
 * @example decodeCursor(cursor, options);
 */
export const decodeCursor = readJobCursor;
