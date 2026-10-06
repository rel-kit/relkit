/** Existing public jobs error constructor and code contract. */
export class JobsCommandError extends Error {
  /**
   * Constructs the unchanged public jobs diagnostic.
   * @param code - Existing usage, protocol or ambiguous-submission code.
   * @param message - Existing actionable diagnostic.
   */
  constructor(
    readonly code:
      "RELKIT_JOBS_USAGE" | "RELKIT_JOBS_REQUEST_FAILED" | "RELKIT_JOB_SUBMISSION_UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "JobsCommandError";
  }
}
