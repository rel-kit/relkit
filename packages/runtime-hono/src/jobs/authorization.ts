import type { JsonValue } from "@relkit/contracts";
import type {
  JobAccessGrant,
  JobAccessRequest,
  JobClientOperation,
  RunSnapshot,
} from "@relkit/contracts/jobs";
import {
  assertAuthorizedOperation,
  authorizeJobAccess,
  type JobAuthorizationContext,
  type JobDescriptorAny,
} from "@relkit/jobs";
import type { TaskJobNode } from "@relkit/graph";
import type { RpcContext } from "../rpc.js";
import { assertGrantScope, jobError, trustedScopeFor } from "./support.js";
import type { JobsRpcRuntime, TrustedJobScope } from "./types.js";

export interface AuthorizedJobOperation {
  readonly grant: JobAccessGrant;
  readonly trusted: TrustedJobScope;
  readonly request: JobAccessRequest;
}

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

export function assertGrantLive(grant: JobAccessGrant): void {
  if (grant.expiresAt !== undefined && Date.parse(grant.expiresAt) <= Date.now()) {
    throw jobError("RELKIT_JOB_ACCESS_DENIED", "Job operation is not authorized.");
  }
}

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
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(accessDenied()), timeoutMs);
    });
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(accessDenied());
      signal?.addEventListener("abort", abort, { once: true });
    });
    return await Promise.race([Promise.resolve().then(authorize), timeout, cancelled]);
  } catch {
    throw accessDenied();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abort !== undefined) signal?.removeEventListener("abort", abort);
  }
}

function accessDenied() {
  return jobError("RELKIT_JOB_ACCESS_DENIED", "Job operation is not authorized.");
}
