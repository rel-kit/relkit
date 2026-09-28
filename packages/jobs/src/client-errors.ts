import type { StandardIssue } from "@relkit/schema";

/** Invalid caller input with the schema issues retained for clients.
 * @example new JobInputValidationError(issues);
 */
export class JobInputValidationError extends TypeError {
  readonly code = "RELKIT_JOB_INPUT_VALIDATION" as const;
  /** @param issues - Standard Schema validation issues. */
  constructor(readonly issues: readonly StandardIssue[]) {
    super("Job input validation failed");
    this.name = "JobInputValidationError";
  }
}
/** Requested job provider profile is absent from client configuration.
 * @example new JobProfileError("primary");
 */
export class JobProfileError extends Error {
  readonly code = "RELKIT_JOB_PROFILE_UNKNOWN" as const;
  /** @param profile - Requested profile name. */
  constructor(readonly profile: string) {
    super(`Job profile "${profile}" is not configured`);
    this.name = "JobProfileError";
  }
}
/** The selected provider does not implement job enqueue.
 * @example new JobProviderError();
 */
export class JobProviderError extends Error {
  readonly code = "RELKIT_JOB_PROVIDER_UNAVAILABLE" as const;
  constructor() {
    super("Job provider does not implement enqueue");
    this.name = "JobProviderError";
  }
}

/** A job call crossed an undeclared function dependency boundary.
 * @example new JobDependencyError("billing.charge");
 */
export class JobDependencyError extends Error {
  readonly code = "RELKIT_JOB_DEPENDENCY_UNDECLARED" as const;
  /** @param jobId - Job that was not declared as a dependency. */
  constructor(readonly jobId: string) {
    super(`Job dependency "${jobId}" is not declared on this function`);
    this.name = "JobDependencyError";
  }
}

/** Caller cancellation before the job operation completed.
 * @example new JobOperationCancelledError();
 */
export class JobOperationCancelledError extends Error {
  readonly code = "ABORT_ERR" as const;
  constructor() {
    super("Job operation cancelled");
    this.name = "AbortError";
  }
}

/** A job client operation exceeded its configured timeout.
 * @example new JobOperationTimeoutError();
 */
export class JobOperationTimeoutError extends Error {
  readonly code = "ETIMEDOUT" as const;
  constructor() {
    super("Job operation timed out");
    this.name = "TimeoutError";
  }
}
