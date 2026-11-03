/** A caller attempted a job operation outside its trusted grant.
 * @example new JobAuthorizationError("Run belongs to another subject");
 */
export class JobAuthorizationError extends Error {
  readonly code = "RELKIT_JOB_ACCESS_DENIED" as const;

  /** @param message - Human-readable denial reason. */
  constructor(message = "Job operation is not authorized") {
    super(message);
    this.name = "JobAuthorizationError";
  }
}

/** A continuation cursor is malformed or bound to another request.
 * @example new JobCursorError();
 */
export class JobCursorError extends TypeError {
  readonly code = "RELKIT_JOB_CURSOR_INVALID" as const;

  constructor() {
    super("Job continuation cursor is invalid or bound to another request");
    this.name = "JobCursorError";
  }
}
