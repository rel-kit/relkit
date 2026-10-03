import type { JsonValue } from "@relkit/contracts";
import type {
  JobAccessGrant,
  JobAccessRequest,
  JobClientOperation,
  RunSnapshot,
} from "@relkit/contracts/jobs";
import type { TaskJobNode } from "@relkit/graph";
import {
  assertAuthorizedOperation,
  authorizeJobAccess,
  type JobAuthorizationContext,
  type JobDescriptorAny,
} from "@relkit/jobs";
import { Effect } from "effect";
import { httpBoundary, observeHttp, runHttp } from "../http-effect.js";
import type { RpcContext } from "../rpc.js";
import type { AuthorizedJobOperation } from "./authorization.types.js";
import { assertGrantScope, jobError, trustedScopeFor } from "./support.js";
import type { JobsRpcRuntime } from "./types.js";
export type { AuthorizedJobOperation } from "./authorization.types.js";

/** Resolves trusted scope and a bounded authorization grant for one job operation.
 * @param config - Configured jobs runtime, authorization and cursor dependencies.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param job - Registered job declaration and its client operation policy.
 * @param descriptor - Resolved runtime declaration and its application callbacks.
 * @param operation - Bounded domain operation or public capability name.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param run - Previously observed run supplied to post-read authorization.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @param runId - Stable run identifier within the owning generation or provider scope.
 * @param stream - Lazy stream or named stream selected by the operation.
 * @returns The frozen validated grant, trusted scope and request used for authorization.
 */
export async function authorizeJobOperation(
  config: JobsRpcRuntime,
  context: RpcContext,
  job: TaskJobNode,
  descriptor: JobDescriptorAny,
  operation: JobClientOperation,
  input?: JsonValue,
  run?: RunSnapshot,
  signal?: AbortSignal,
  runId?: string,
  stream?: string,
): Promise<AuthorizedJobOperation> {
  const trusted = await trustedScopeFor(config, context, job, operation, input, run);
  const requestedRunId = run?.runId ?? runId;
  const request: JobAccessRequest = {
    operation,
    jobId: job.jobId,
    ...(requestedRunId === undefined ? {} : { runId: requestedRunId }),
    ...(stream === undefined ? {} : { stream }),
    ...(input === undefined ? {} : { input }),
  };
  const authorizationContext: JobAuthorizationContext = {
    application: trusted.application,
    environment: trusted.environment,
    scope: trusted.scope,
    ...(trusted.subject === undefined ? {} : { subject: trusted.subject }),
    auth: context.auth,
    ...(run === undefined ? {} : { run }),
  };
  const grant = await boundedGrant(
    () => authorizeJobAccess(descriptor, request, trusted, authorizationContext),
    signal,
    config.authTimeoutMs,
  );
  assertAuthorizedOperation(grant, request, trusted);
  assertGrantScope(grant, trusted);
  return Object.freeze({ grant, trusted, request });
}

/** Rejects a job observation after its authorization grant has expired.
 * @param grant - Authorization grant whose scope and expiry bound this operation.
 * @returns Nothing; the requested update is applied to the owned state.
 */
export function assertGrantLive(grant: JobAccessGrant): void {
  if (grant.expiresAt !== undefined && Date.parse(grant.expiresAt) <= Date.now()) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job operation is not authorized.");
  }
}

/** Bounds the foreign authorization callback and maps denial to the public job error.
 * @param authorize - authorize supplied by the caller.
 * @param signal - Cancellation signal inherited from the caller or owning scope.
 * @param configuredTimeout - Configured authorization deadline, capped by the runtime limit.
 * @returns The policy grant, rejecting with access denied on cancellation, timeout or callback failure.
 */
async function boundedGrant(
  authorize: () => Promise<JobAccessGrant>,
  signal: AbortSignal | undefined,
  configuredTimeout: number | undefined,
): Promise<JobAccessGrant> {
  const timeoutMs = Math.min(
    Number.isSafeInteger(configuredTimeout) && (configuredTimeout as number) > 0
      ? (configuredTimeout as number)
      : 10_000,
    10_000,
  );
  try {
    return await runHttp(
      observeHttp(
        "jobs.authorize",
        httpBoundary("jobs.policy", () => Promise.resolve().then(authorize)).pipe(
          Effect.timeout(timeoutMs),
        ),
      ),
      signal,
    );
  } catch {
    throw accessDenied();
  }
}

/** Creates the safe job authorization failure.
 * @returns The public RELKIT_JOB_ACCESS_DENIED error without private policy details.
 */
function accessDenied() {
  return jobError("RELKIT_JOB_ACCESS_DENIED", "Job operation is not authorized.");
}
