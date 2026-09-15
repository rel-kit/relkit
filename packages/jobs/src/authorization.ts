import type { JobAccessGrant, JobAccessRequest } from "@relkit/contracts/jobs";
import type { JobDescriptorAny } from "./job-types.js";
import { isRfc3339Instant } from "./instant-validation.js";
import { JobAuthorizationError } from "./authorization-errors.js";
import {
  createJobCursor,
  readJobCursor,
} from "./authorization-cursor.js";
import { projectRunPage, projectRunSnapshot } from "./authorization-projection.js";

export { JobAuthorizationError, JobCursorError } from "./authorization-errors.js";
export {
  createJobCursor,
  readJobCursor,
  type JobCursorBinding,
} from "./authorization-cursor.js";
export { projectRunPage, projectRunSnapshot } from "./authorization-projection.js";

export interface TrustedJobScope {
  readonly application: string;
  readonly environment: string;
  readonly scope: string;
  readonly subject?: string;
}

export function authorizeJobAccess(
  job: JobDescriptorAny,
  request: JobAccessRequest,
  trusted: TrustedJobScope,
): Promise<JobAccessGrant> {
  assertBoundedText(trusted.application);
  assertBoundedText(trusted.environment);
  assertBoundedText(trusted.scope);
  if (request.jobId !== job.id) throw new JobAuthorizationError();
  const policy = job.client;
  if (policy === undefined || !policy.operations.includes(request.operation)) {
    throw new JobAuthorizationError();
  }
  if ("public" in policy && policy.public === true) {
    return Promise.resolve(Object.freeze({ scope: trusted.scope }));
  }
  if (!("authorize" in policy) || typeof policy.authorize !== "function") {
    throw new JobAuthorizationError();
  }
  return Promise.resolve(policy.authorize(request)).then(
    (grant) => {
      assertJobGrant(grant, trusted);
      return Object.freeze({
        scope: grant.scope,
        ...(grant.expiresAt === undefined ? {} : { expiresAt: grant.expiresAt }),
      });
    },
    () => { throw new JobAuthorizationError(); },
  );
}

export function assertJobGrant(
  value: unknown,
  trusted: TrustedJobScope,
  now = Date.now(),
): asserts value is JobAccessGrant {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new JobAuthorizationError();
  const grant = value as JobAccessGrant;
  if (typeof grant.scope !== "string" || !ownsScope(trusted.scope, grant.scope)) {
    throw new JobAuthorizationError();
  }
  assertBoundedText(grant.scope);
  if (grant.expiresAt !== undefined) {
    if (!isRfc3339Instant(grant.expiresAt)) throw new JobAuthorizationError();
    const expiry = Date.parse(grant.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= now) throw new JobAuthorizationError();
  }
}

export function assertAuthorizedOperation(
  grant: JobAccessGrant,
  request: JobAccessRequest,
  trusted: TrustedJobScope,
  now = Date.now(),
): void {
  assertJobGrant(grant, trusted, now);
  if (request.jobId.length === 0 || request.operation.length === 0) throw new JobAuthorizationError();
}

export const authorize = authorizeJobAccess;
export const projectRun = projectRunSnapshot;
export const createCursor = createJobCursor;
export const decodeCursor = readJobCursor;

function ownsScope(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}:`);
}

function assertBoundedText(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || new TextEncoder().encode(value).byteLength > 256) {
    throw new JobAuthorizationError();
  }
}
