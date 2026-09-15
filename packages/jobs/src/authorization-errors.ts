export class JobAuthorizationError extends Error {
  readonly code = "RELKIT_JOB_ACCESS_DENIED" as const;

  constructor(message = "Job operation is not authorized") {
    super(message);
    this.name = "JobAuthorizationError";
  }
}

export class JobCursorError extends TypeError {
  readonly code = "RELKIT_JOB_CURSOR_INVALID" as const;

  constructor() {
    super("Job continuation cursor is invalid or bound to another request");
    this.name = "JobCursorError";
  }
}
